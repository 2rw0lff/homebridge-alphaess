
import { Logging } from 'homebridge';
import crypto from 'crypto';
import { AlphaLoginResponse } from './response/AlphaLoginResponse';
import { AlphaDetailResponse } from './response/AlphaDetailResponse';
import { AlphaStatisticsByDayResponse } from './response/AlphaStatisticsByDayResponse';
import { ObjectMapper } from 'jackson-js';
import { AlphaSettingsResponse } from './response/AlphaSettingsResponse';
const request = require('request');


const AUTHPREFIX = 'al8e4s';
const AUTHCONSTANT = 'LS885ZYDA95JVFQKUIUUUV7PQNODZRDZIS4ERREDS0EED8BCWSS';
const AUTHSUFFIX = 'ui893ed';

// see https://github.com/CharlesGillanders/alphaess
export const BASE_URL= 'https://cloud.alphaess.com/api';
export class AlphaService {
  private logger: Logging;
  private username;
  private password;
  private logRequestDetails: boolean;
  private baseUrl: string;

  constructor(logger: Logging | undefined, username: string | undefined, password: string, logRequestDetails: boolean, url: string ) {
    this.logger = logger;
    this.password = password;
    this.username = username;
    this.logRequestDetails = logRequestDetails;
    this.baseUrl = url;
  }


  async getDetailData(token, serialNumber): Promise<AlphaDetailResponse> {
    const authtimestamp = Math.round(new Date().getTime() / 1000).toString();
    const authsignature = this.getSignature(authtimestamp);
    const url = this.baseUrl + '/ESS/GetLastPowerDataBySN?noLoading=true&sys_sn=' + serialNumber;

    if (this.logRequestDetails) {
      this.logRequestData(authsignature, authtimestamp, url, '', token, serialNumber);
    }

    const req = {
      method: 'GET',
      url: url,
      json: true,
      gzip: false,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'authtimestamp': authtimestamp,
        'authsignature': authsignature,
        'Authorization': 'Bearer ' + token,
      },
    };

    return new Promise((resolve, reject) => {
      request(req, (error, response, body) => {
        if (!error && response.statusCode == 200) {
          const detailResponse = new ObjectMapper().parse<AlphaDetailResponse>(JSON.stringify(body));
          return resolve(detailResponse);
        }
        return reject(body);
      },
      );
    });
  }


  // check if current loading of battery makes sense, and if so trigger it
  async checkAndEnableReloading(token:string, serialNumber:string, priceIsLow : boolean, socBattery:number, socLowerThreshold:number):
    Promise <Map<string, unknown>> {

    const settingsData = await this.getSettingsData(token, serialNumber).catch( () => {
      this.logMsg('could not fetch settings data ');
      const resp = new AlphaSettingsResponse();
      resp.data = new Map<string, undefined> ;
      return resp;
    });

    const updateSettingsData = this.calculateUpdatedSettingsData(settingsData.data, priceIsLow, socBattery, socLowerThreshold);

    // update settings needed
    if (updateSettingsData!==undefined){
      // update required
      await this.setAlphaSettings(token, serialNumber, updateSettingsData);
      return updateSettingsData;
    }

    return undefined;
  }


  // calculate loading settings: if currently loading, continue, else disable loading trigger
  async isBatteryCurrentlyLoading(token: string, serialNumber:string) : Promise<boolean> {

    const settings = await this.getSettingsData(token, serialNumber).catch( () => {
      this.logMsg('could not fetch settings data ');
      return false;
    } );

    // enable trigger reloading now for one hour, exit
    const timeLoadingStart = ''+ settings['time_chaf1a'];
    const hourLoadingStart = parseInt(timeLoadingStart.substring(0, 2));
    const time_active_start = new Date().getHours() >= hourLoadingStart;

    const timeLoadingEnd = ''+ settings['time_chae1a'];
    const hourLoadingEnd = parseInt(timeLoadingEnd.substring(0, 2));
    const loadingShallEnd = new Date().getHours() > hourLoadingEnd;


    const loadingFeatureSet = settings['grid_charge'] === 1;
    const isCurrentlyLoading = loadingFeatureSet && time_active_start && !loadingShallEnd ;

    return isCurrentlyLoading;
  }

  // calculate loading settings: if currently loading, continue, else disable loading trigger
  calculateUpdatedSettingsData(newSettingsData: Map<string, unknown>, priceIsLow : boolean, socBattery:number, socLowerThreshold:number):
     Map<string, unknown> {

    const batteryLow = socBattery <= socLowerThreshold ;

    // enable trigger reloading now for one hour, exit
    const timeLoadingStart = ''+ newSettingsData['time_chaf1a'];
    const hourLoadingStart = parseInt(timeLoadingStart.substring(0, 2));
    const time_active_start = new Date().getHours() >= hourLoadingStart;

    const timeLoadingEnd = ''+ newSettingsData['time_chae1a'];
    const hourLoadingEnd = parseInt(timeLoadingEnd.substring(0, 2));


    const loadingFeatureSet = newSettingsData['grid_charge'] === 1 ;
    const isCurrentlyLoading = time_active_start && loadingFeatureSet ;
    const loadingShallEndByTime = (new Date().getHours() > hourLoadingEnd) && isCurrentlyLoading;
    const loadingShallEndByPrice = !priceIsLow && isCurrentlyLoading;

    this.logMsg('calculate new loading isCurrentlyLoading: ' + isCurrentlyLoading + ' time_active_start:' +
    time_active_start +' loadingShallEndByTime:' + loadingShallEndByTime);

    //shall load
    if (batteryLow && priceIsLow ){
      // -> if not loading, start it with hours = now plus one hour
      if (!isCurrentlyLoading){
        console.debug('lets put some energy in this place <---');
        const now = new Date();
        newSettingsData['grid_charge'] = 1;
        newSettingsData['time_chaf1a'] = this.getHourString(now.getHours());
        let nextHours = now.getHours();
        if (nextHours===23){
          nextHours = 0; // day switch
        }else {
          nextHours = nextHours + 1;
        }
        newSettingsData['time_chae1a'] = this.getHourString(nextHours);
        this. logMsg('currently not loading detected, enable it via api ');
        return newSettingsData;
      }
    }

    // disable loading after time is up or price goes up
    if (loadingShallEndByPrice || loadingShallEndByTime ){
      this. logMsg('loading shall stop now, disable it ');
      // disable loading, set default time values
      newSettingsData['grid_charge'] = 0;
      newSettingsData['time_chaf1a'] = '00:00';
      newSettingsData['time_chae1a'] = '00:00';
      return newSettingsData;
    }

  }

  getHourString(hour:number ): string {
    let hourString = hour + ':00';
    if (hour < 10){
      hourString = '0' + hour + ':00';
    }
    return hourString;
  }

  async setAlphaSettings(token:string, serialNumber:string, alphaSettingsData:Map<string, unknown> ): Promise<boolean>{
    const authtimestamp = Math.round(new Date().getTime() / 1000).toString();
    const authsignature = this.getSignature(authtimestamp);
    const url = this.baseUrl + '/Account/CustomUseESSSetting';
    if (this.logRequestDetails) {
      this.logRequestData(authsignature, authtimestamp, url, '', token, serialNumber);
    }

    const req = {
      method: 'POST',
      url: url,
      json: true,
      gzip: false,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'authtimestamp': authtimestamp,
        'authsignature': authsignature,
        'Authorization': 'Bearer ' + token,
      },
      body: alphaSettingsData,
    };

    return new Promise((resolve, reject) => {
      request(req, (error, response) => {
        if (!error && response.statusCode === 200) {
          return resolve(true);
        }
        return reject(false);
      },
      );
    });
  }


  async getSettingsData(token:string, serialNumber:string): Promise<AlphaSettingsResponse> {
    const authtimestamp = Math.round(new Date().getTime() / 1000).toString();
    const authsignature = this.getSignature(authtimestamp);
    const url = this.baseUrl + '/Account/GetCustomUseESSSetting';

    if (this.logRequestDetails) {
      this.logRequestData(authsignature, authtimestamp, url, '', token, serialNumber);
    }

    const req = {
      method: 'GET',
      url: url,
      json: true,
      gzip: false,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'authtimestamp': authtimestamp,
        'authsignature': authsignature,
        'Authorization': 'Bearer ' + token,
      },
    };

    return new Promise((resolve, reject) => {
      request(req, (error, response, body) => {
        if (!error && response.statusCode == 200) {
          const response = new ObjectMapper().parse<AlphaSettingsResponse>(JSON.stringify(body));
          return resolve(response);
        }
        return reject(body);
      },
      );
    });
  }

  async getStatisticsData(token:string, serialNumber:string): Promise<AlphaStatisticsByDayResponse> {
    const authtimestamp = Math.round(new Date().getTime() / 1000).toString();
    const authsignature = this.getSignature(authtimestamp);
    const url = this.baseUrl + '/Power/SticsByDay';

    const dateString = new Date().toDateString();

    if (this.logRequestDetails) {
      this.logRequestData(authsignature, authtimestamp, url, '', token, serialNumber);
    }

    const req = {
      method: 'POST',
      url: url,
      json: true,
      gzip: false,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'authtimestamp': authtimestamp,
        'authsignature': authsignature,
        'Authorization': 'Bearer ' + token,
      },
      body:
      {
        sn: serialNumber,
        szDay: dateString,
      },
    };

    return new Promise((resolve, reject) => {
      request(req, (error, response, body) => {
        if (!error && response.statusCode == 200) {
          const response = new ObjectMapper().parse<AlphaStatisticsByDayResponse>(JSON.stringify(body));
          return resolve(response);
        }
        return reject(body);
      },
      );
    });
  }

  async login(): Promise<AlphaLoginResponse> {
    const authtimestamp = Math.round(new Date().getTime() / 1000).toString();
    const authsignature = this.getSignature(authtimestamp);
    const url = this.baseUrl + '/Account/Login';
    if (this.logRequestDetails) {
      this.logRequestData(authsignature, authtimestamp, url, '', '', '');
    }

    const req = {
      method: 'POST',
      url: url,
      json: true,
      gzip: false,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'keep-alive',
        'authtimestamp': authtimestamp,
        'authsignature': authsignature,
      },
      body:
            {
              username: this.username,
              password: this.password,
            },
    };

    return new Promise((resolve, reject) => {
      request(req, (error, response, body) => {
        if (!error && response.statusCode == 200) {
          const loginResponse = new ObjectMapper().parse<AlphaLoginResponse>(JSON.stringify(body));
          return resolve(loginResponse);
        }
        return reject(body);
      },
      );
    });
  }


  getTotalPower(detailData: AlphaDetailResponse){
    const stringPowerTotal = detailData.data.ppv1 + detailData.data.ppv2 +
    detailData.data.ppv3 + detailData.data.ppv4 +
    detailData.data.pmeter_dc;
    return stringPowerTotal;
  }

  // calculate the trigger depending on power and socLoading
  isTriggered(detailData:AlphaDetailResponse, powerLoadingThreshold:number, socLoadingThreshold: number): boolean {
    let trigger = false;
    const soc = detailData.data.soc;
    // power of all strings plus dc power = total energy from the sun into the system
    const stringPowerTotal = this.getTotalPower(detailData);

    let pvTrigger = false;
    let socTrigger = false;
    this.logMsg('soc: ' + soc );
    this.logMsg('pBatt :' + detailData.data.pbat);
    this.logMsg('stringPowerTotal :' +stringPowerTotal );

    if (stringPowerTotal > powerLoadingThreshold){
      this.logMsg('Power total on the strings :' + stringPowerTotal + ' is over threshold:' +
                powerLoadingThreshold + ' power trigger: true');
      pvTrigger = true;
    }
    if (soc >= socLoadingThreshold){
      this.logMsg('Battery SOC:' + soc + ' is over threshold:' +socLoadingThreshold + ' soc trigger:true ');
      socTrigger = true;
    }

    if (socTrigger===true && pvTrigger===true){
      trigger = true ;
    }

    this.logMsg('Calculating trigger ->  powerLoadingThreshold: ' + powerLoadingThreshold + ' socLoadingThreshold:' +
                socLoadingThreshold + ' resulting in trigger:'+ trigger);

    return trigger;
  }

  private getSignature(authtimestamp):string {
    const gen_hash = crypto.createHash('sha512').update(AUTHCONSTANT + authtimestamp).digest('hex');
    return AUTHPREFIX + gen_hash + AUTHSUFFIX;
  }

  logRequestData(authsignature: string, authtimestamp: string, url: string, data: string, token: string, serialNumber) {
    this.logMsg('Log Request data for url ' + url);
    this.logMsg('authtimestamp     ' + authtimestamp);
    this.logMsg('data' + data);
    this.logMsg('authsignature:' + authsignature);
    this.logMsg('token:' + token);
    this.logMsg('serialNumber:' + serialNumber);
    this.logMsg('###################');
  }

  private logMsg(message) {
    if (this.logger !== undefined) {
      this.logger.debug(message);
    } else {
      console.log('%s', message);
    }
  }
}
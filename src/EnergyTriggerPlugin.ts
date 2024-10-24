
import { HAP, API, Characteristic, Logging, PlatformConfig } from 'homebridge';
import { AlphaTrigger } from './index';
import { ImageRenderingService } from './index';
import { Utils } from './index';
import { AlphaService } from './index';
import { AlphaMqttService, MqttTopics } from './index';
import { TibberService } from './index';
import { AlphaLastPowerDataResponse } from './alpha/response/AlphaLastPowerDataResponse';
import { BasePlugin } from './BasePlugin';
import { TriggerConfig, TriggerStatus } from './interfaces';
/**
 * This Plugin provides a homebridge trigger logic that can be used to control external devices.
 *
 */
export class EnergyTriggerPlugin extends BasePlugin {

  private config: PlatformConfig;

  private triggerTotal: boolean;
  private triggerAlpha : TriggerStatus;
  private triggerTibber: boolean;
  private triggerImageFilename: string;
  private socCurrent: number;
  private tibberThresholdSOC: number; // soc percentage to trigger tibber loading
  private lastClearDate: Date ;
  private alphaImageService: ImageRenderingService;

  private alphaTriggerMap: Map<number, AlphaTrigger>;
  private utils: Utils;
  // alpha mqtt service
  private mqtt: AlphaMqttService;
  private tibber: TibberService;
  private isBatteryLoadingFromNet = false;
  private tibberLoadingMinutes: number;
  private dailyLoadingFromNetReset : boolean;
  private disableBatteryUnloading : boolean; // battery unloading stopped during loading with tibber

  private triggerConfig: TriggerConfig;

  // Alpha ESS Battery Light Total Power Plugin
  constructor (log: Logging, config: PlatformConfig, api: API, alphaService: AlphaService) {
    super(log, config, api, alphaService, 'EnergyTriggerPlugin' );
    this.alphaTriggerMap = new Map();
    this.socCurrent = -1;
    this.config = config;
    this.triggerAlpha = new TriggerStatus(null, null, false); // no trigger at the beginning
    this.triggerTibber = false;
    this.utils = new Utils();
    this.lastClearDate = new Date();
    this.lastClearDate.setHours(0);
    this.lastClearDate.setMinutes(0);
    this.lastClearDate.setMinutes(1);
    this.isBatteryLoadingFromNet = false;
    this.dailyLoadingFromNetReset = false;
    this.triggerTotal = false;
    this.triggerTibber = false;

    this.alphaImageService = new ImageRenderingService();
    this.tibberLoadingMinutes = config.tibberLoadingMinutes;
    this.triggerImageFilename = config.triggerImageFilename;
    this.tibberThresholdSOC = config.tibberThresholdSOC;
    this.disableBatteryUnloading = config.disableBatteryUnloading;

    this.triggerConfig = new TriggerConfig(
      this.config.powerLoadingThreshold,
      this.config.powerLoadingThresholdSecondsLower,
      this.config.powerLoadingThresholdSecondsUpper,
      this.config.socLoadingThreshold);

    if (!config.tibberEnabled ) {
      this.getLOG().debug('Tibber API trigger is disabled');
    } else {
      this.getLOG().debug('Tibber API trigger is enabled');
      this.tibber = new TibberService(log, config.tibberAPIKey, config.tibberUrl, config.tibberThresholdEur,
        config.tibberThresholdTotalEur, config.tibberLoadBatteryEnabled, config.tibberDischargeDisabled, config.tibberHomeId);
    }

    if (this.config.mqtt_url===undefined ){
      this.getLOG().debug('mqtt_url is not set, not pushing anywhere');
    } else{
      const topics = new MqttTopics();
      topics.mqtt_status_topic = config.mqtt_status_topic;
      topics.mqtt_trigger_topic_true = this.config.mqtt_trigger_topic_true;
      topics.mqtt_trigger_topic_false= this.config.mqtt_trigger_topic_false;
      topics.mqtt_trigger_message_true = this.config.mqtt_trigger_message_true;
      topics.mqtt_trigger_message_false = this.config.mqtt_trigger_message_false;
      this.mqtt = new AlphaMqttService(log, config.mqtt_url, topics);
    }
  }

  setTibberService(tibberService: TibberService){
    this.tibber = tibberService;
  }

  onResponse(alphaLastPowerDataResponse: AlphaLastPowerDataResponse) {
    this.calculateCombinedTriggers(this.config, alphaLastPowerDataResponse );
  }

  getTibberService(){
    return this.tibber;
  }

  setSocCurrent(soc:number){
    this.socCurrent = soc;
  }

  setTibberTrigger(triggerTibber:boolean){
    this.triggerTibber = triggerTibber;
  }

  initServiceCharacteristics(hap: HAP) {
    if (hap!==undefined){
      this.setService(new hap.Service.ContactSensor(this.getName()));
      this.getCharacteristics().onGet(this.handleGet.bind(this));
    }
  }

  getCharacteristics(): Characteristic {
    return this.getService().getCharacteristic(this.getHAP().Characteristic.ContactSensorState);
  }

  getTriggerTotal(){
    return this.triggerTotal;
  }

  calculateCombinedTriggers(config: PlatformConfig, alphaLastPowerDataResp: AlphaLastPowerDataResponse){

    this.checkTibberLoading(config.serialnumber).catch(error => {
      this.getLOG().error(error);
    });

    this.calculateAlphaTrigger(alphaLastPowerDataResp).catch(error => {
      this.getLOG().error(error);
    });

    this.triggerTotal = this.triggerAlpha.status || this.triggerTibber;

    if (config.tibberEnabled ) {
      this.calculateTibberTrigger(this.tibber).catch(error => {
        this.getLOG().error(error);
      });
    }


    this.triggerTotal = this.triggerAlpha.status || this.triggerTibber;
    this.getLOG().debug('Calculated triggers: alpa ess: '+ this.triggerAlpha.status + ' tibber: ' + this.triggerTibber +
            ' triggerTotal :'+this.triggerTotal);

    this.setValue(this.getContactSensorState(this.triggerTotal));

    //refresh combined trigger
    if (this.getService() !== undefined){
      this.getLOG().debug('Updating sensor status to: ' + this.triggerTotal);
      this.pushMqtt(this.triggerTotal);
      this.getCharacteristics().updateValue(this.getContactSensorState(this.triggerTotal));
    }

    // render image
    let tibberMap = new Map();
    let tibberMaxPrice = -1 ;
    let tibberDiff = -1 ;
    let tibberDayLowest = -1 ;

    if (this.tibber !== undefined){
      tibberMap = this.tibber.getDailyMap();
      tibberMaxPrice = this.tibber.getMaxPrice();
      tibberDiff = this.tibber.getThresholdEur();
      tibberDayLowest = this.tibber.getDailyLowest();
    }

    if (this.triggerImageFilename!==undefined){
      this.alphaImageService.renderTriggerImage(this.triggerImageFilename, tibberMap,
        this.alphaTriggerMap, tibberMaxPrice, tibberDiff, tibberDayLowest,
      ).catch(error => {
        this.getLOG().error('error rendering image: ', error);
      });
    }
  }


  async calculateTibberTrigger(tibber: TibberService) {
    try {
      await tibber.isTriggered(this.socCurrent, this.tibberThresholdSOC).
        then(result => {
          this.setTibberTrigger(result);
        }).catch(() => {
          this.getLOG().error('could not fetch trigger result ');
        });
    } catch (err){
      this.getLOG().error('' + err);
    }
    return this.triggerTibber;
  }

  async checkTibberLoading(serialNumber: string) {
    const priceIsLow = this.triggerTibber;
    const socBattery = this.socCurrent;
    const socBatteryThreshold = this.tibberThresholdSOC;

    // check battery reloading from tibber
    if (this.config.tibberEnabled && this.tibber.getTibberLoadingBatteryEnabled() ) {
      this.getLOG().debug('Check reloading of battery triggered');
      this.getAlphaService().checkAndEnableReloading(
        serialNumber,
        priceIsLow,
        this.tibberLoadingMinutes,
        socBattery,
        socBatteryThreshold,
        this.config.disableBatteryUnloading).then(
        () => {
          this.getLOG().debug('Check reloading if battery from net was done.');
        },
      ) .catch(error => {
        this.getLOG().error('Error Checking Battery Loading via Tibber price trigger: ' + error);
        return;
      });

      this.getAlphaService().isBatteryCurrentlyLoadingCheckNet(serialNumber).then(
        batteryLoading => {
          this.isBatteryLoadingFromNet = batteryLoading;
          this.getLOG().debug('Loading Battery Status from Net:' + batteryLoading);
        }).
        catch(error => {
          this.getLOG().error('Error Checking Battery currently loading not possible' + error);
          this.isBatteryLoadingFromNet = this.getAlphaService().isBatteryCurrentlyLoading();
          return;
        });


      if (this.tibber !== undefined){
        if (this.tibber.getIsTriggeredToday()===false && this.dailyLoadingFromNetReset === false ){
          this.getLOG().debug('no loading possible today, stop eventually existing loading');
          this.getAlphaService().stopLoading(serialNumber);
          this.tibber.setIsTriggeredToday(undefined);
          this.dailyLoadingFromNetReset = true;
        }
      }
    }
  }

  async calculateAlphaTrigger(alphaLastPowerDataResponse: AlphaLastPowerDataResponse) {
    this.getLOG().debug('calculateAlphaTrigger called.');

    const detailData = alphaLastPowerDataResponse;
    if (detailData!==null && detailData.data!==null && detailData.data!==undefined){

      this.setSocCurrent(detailData.data.soc);
      this.triggerAlpha = this.getAlphaService().isTriggered(detailData, this.triggerConfig, this.triggerAlpha);

      const now = new Date();
      const hours = now.getHours();
      const min = now.getMinutes();
      const index = hours * 4 + Math.round(min/15);
      this.alphaTriggerMap.set(index, new AlphaTrigger(this.triggerAlpha.status === true ? 1:0, this.isBatteryLoadingFromNet, new Date()));

      if (this.utils.isNewDate(now, this.lastClearDate)){
        // day switch, empty cache
        this.alphaTriggerMap.clear();
        if (this.tibber !== undefined){
          this.tibber.getDailyMap().clear();
          this.tibber.setIsTriggeredToday(undefined);
          this.dailyLoadingFromNetReset = false; // allow new daily loading reset
        }
        this.lastClearDate = now;
      }
    } else {
      this.getLOG().error('Response from Alpha Ess did not contain any good information. Response was: ' + detailData);
    }

  }



  pushMqtt(triggerTotal: boolean){
    if (this.mqtt !== undefined) {
      this.mqtt.pushTriggerMessage(triggerTotal);
    }
  }

  getContactSensorState(triggerTotal : boolean) {
    if (triggerTotal === false){
      this.getLOG().debug('trigger not fired -> status CONTACT_DETECTED');
      return this.getHAP().Characteristic.ContactSensorState.CONTACT_DETECTED;
    }
    this.getLOG().debug('trigger fired -> status CONTACT_NOT_DETECTED');
    return this.getHAP().Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
  }


}

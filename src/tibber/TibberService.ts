import { TibberQuery, IConfig } from 'tibber-api';
import { IPrice } from 'tibber-api/lib/src/models/IPrice';
import { PriceTrigger } from '../interfaces';
import { Logging } from 'homebridge';
import { parse, parseISO } from 'date-fns';


export class TibberService {
  private config: IConfig;
  private dailyMap: Map<number, PriceTrigger>;
  private tibberHomeId: string ;
  private logger: Logging;
  private lowestPriceHours: number ;
  private lowestPriceToday : number;
  private tibberLoadBatteryEnabled: boolean;
  private thresholdEur: number ;
  private thresholdTotalMinEur: number;
  private thresholdTotalMaxEur: number;

  private triggerdToday: boolean;
  private tibberDischargeDisabled: boolean;


  constructor(logger:Logging, tibberApiKey:string, tibberQueryUrl:string, thresholdEur: number,
    thresholdMinTotalEur: number, tibberThresholdMaxTotalEur: number,
    tibberLoadBatteryEnabled:boolean, tibberDischargeDisabled:boolean, tibberHomeId?: string){
    this.config = {
      // Endpoint configuration
      apiEndpoint: {
        apiKey:  tibberApiKey, //'5K4MVS-OjfWhK_4yrjOlFe1F6kJXPVf7eQYggo8ebAE', // Demo token
        queryUrl: tibberQueryUrl, //'wss://api.tibber.com/v1-beta/gql/subscriptions',
      },
      // Query configuration.
      homeId: tibberHomeId, // '96a14971-525a-4420-aae9-e5aedaa129ff',
      timestamp: true,
      power: true,
      active: true,
    };
    this.thresholdEur = thresholdEur;
    this.dailyMap = new Map();
    this.tibberHomeId= tibberHomeId;
    this.logger = logger;
    this.lowestPriceHours = undefined;
    this.lowestPriceToday = undefined;
    this.tibberLoadBatteryEnabled = tibberLoadBatteryEnabled;
    this.triggerdToday = undefined;
    this.thresholdTotalMinEur = thresholdMinTotalEur;
    this.thresholdTotalMaxEur = tibberThresholdMaxTotalEur;
    this.tibberDischargeDisabled = tibberDischargeDisabled; // stop discharging during tibber time
  }

  getLogger() : Logging{
    return this.logger;
  }

  setLogger(logger:Logging){
    this.logger = logger;
  }

  getDailyMap(): Map<number, PriceTrigger>{
    return this.dailyMap;
  }

  async getTodaysEnergyPrices(): Promise<IPrice[]> {
    const tibberQuery = new TibberQuery(this.config);
    return new Promise((resolve, reject) => {
      tibberQuery.getHomes().then( homes => {
        const homeId = this.tibberHomeId !== undefined ? this.tibberHomeId : homes[0].id;
        return resolve(tibberQuery.getTodaysEnergyPrices(homeId));
      }).catch( error => {
        this.getLogger().debug('could not collect home ids ', error);
        return reject();
      }).catch(err => {
        this.getLogger().debug('could not collect todays energy prices ', err);
      });
    });

  }

  // get maxium price allowed by configuration to load (usage: save some money during low prices)
  getMaxPrice(): number {
    return this.thresholdTotalMinEur; // minimum price limit to trigger loadijg
  }


  // get min upper price allowed by configuration to load (usage: save from high energy prices)
  getMinPrice(): number {
    return this.thresholdTotalMaxEur; // maximum price limit to trigger loading
  }


  // get diff price OK to load
  getDiff(): number {
    return this.thresholdEur;
  }

  // get daily lowest price
  getDailyLowest(): number {
    return this.lowestPriceToday;
  }

  // determine lowest next price for the curent day
  findLowestPrice(prices: IPrice[]): IPrice {
    let lowest = undefined;
    let lowestIPrice = undefined;
    if (prices===undefined){
      return undefined;
    }
    prices.forEach(price => {
      price.total;
      if (lowest===undefined){
        lowest = price.total;
        lowestIPrice = price;
      }else{
        if (price.total < lowest){
          lowest = price.total;
          lowestIPrice = price;
        }
      }
    });
    return lowestIPrice;
  }

  // isBeforeTodaysHour

  isBeforeTodaysHour(timeStamp:string, hour: number) {
    //  "startsAt": "2017-10-11T19:00:00+02:00"
    const date = parseISO(timeStamp);
    return date.getHours() <= hour;
  }

  // determine lowest price before hour number
  findLowestPriceBefore(prices: IPrice[], hour: number): IPrice {
    let lowest = undefined;
    let lowestIPrice = undefined;
    if (prices===undefined){
      return undefined;
    }
    prices.forEach(price => {
      price.total;
      if (lowest===undefined){
        lowest = price.total;
        lowestIPrice = price;
      }else{
        if (price.total < lowest && (this.isBeforeTodaysHour(price.startsAt, hour))){
          lowest = price.total;
          lowestIPrice = price;
        }
      }
    });
    return lowestIPrice;
  }



  // determine lowest next price for the curent day
  findHighestPrice(prices: IPrice[]): IPrice {
    let highest = undefined;
    let highestIPrice = undefined;
    if (prices===undefined){
      return undefined;
    }
    prices.forEach(price => {
      price.total;
      if (highest===undefined){
        highest = price.total;
        highestIPrice = price;
      }else{
        if (price.total > highest){
          highest = price.total;
          highestIPrice = price;
        }
      }
    });
    return highestIPrice;
  }

  // determine lowest next price for the curent day
  async findCurrentPrice(): Promise<number> {
    const tibberQuery = new TibberQuery(this.config);
    return new Promise((resolve, reject) => {

      tibberQuery.getHomes().then( homes => {
        const homeId = this.tibberHomeId !== undefined ? this.tibberHomeId : homes[0].id;
        tibberQuery.getCurrentEnergyPrice(homeId).then(current => {
          return resolve(current.total);
        } ).
          catch(error => {
            this.getLogger().
              debug('Tibber: Could not fetch prices: statusMessage:' + error.statusMessage + ' errorCode:' +error.statusCode);
            return reject();
          },
          );
      }).catch(err => {
        this.getLogger().
          error('could not fetch home ids ' + err);
      });
    });
  }


  async isTriggered(
    socCurrent: number /** Current SOC of battery */,
    socLowerThreshold: number /** SOC of battery to be trigger */): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.setIsTriggeredToday(false);
      this.findCurrentPrice().then( currentPrice => {
        this.getTodaysEnergyPrices().then(todaysEnergyPrices => {
          if (todaysEnergyPrices===undefined){
            this.getLogger().debug('Could not fetch todays prices, response is empty');
            return reject(false);
          }
          const todaysLowestIPrice = this.findLowestPrice(todaysEnergyPrices);
          const todaysLowestTime = todaysLowestIPrice.startsAt;
          const dateObject = new Date(todaysLowestTime);
          this.lowestPriceHours = dateObject.getHours(); // at which hour starts minimum Price ?
          const todaysLowestPrice = todaysLowestIPrice.total;
          const todaysHighesttIPrice = this.findHighestPrice(todaysEnergyPrices);
          const todaysHighestPrice = todaysHighesttIPrice.total;
          const todaysHighestPriceHour = parseISO(todaysHighesttIPrice.startsAt).getHours();
          const lowestPriceUntilPeakHour = this.findLowestPriceBefore(todaysEnergyPrices, todaysHighestPriceHour).total;

          // check if we have the lowest energy price for today - if yes, raise the trigger
          const isTriggered= this._getTrigger(todaysLowestPrice,
            todaysHighestPrice,
            todaysHighestPriceHour,
            lowestPriceUntilPeakHour,
            currentPrice,
            socCurrent,
            socLowerThreshold);

          const now = new Date();
          const hours = now.getHours();
          const min = now.getMinutes();
          const index = hours * 4 + Math.round(min/15);
          const currentIndex = hours * 4 + Math.round(min/15);
          this.lowestPriceToday = todaysLowestPrice;

          this.getDailyMap().set(index, new PriceTrigger(currentPrice, isTriggered?1:0, new Date()));
          todaysEnergyPrices.forEach(hourlyprice => {
            const dateString = hourlyprice.startsAt;
            const cents = hourlyprice.total;
            const dateLong = Date.parse(dateString);
            const date = new Date(dateLong);
            const hours = date.getHours();
            const min = date.getMinutes();
            const index = hours * 4 + Math.round(min/15);
            if (isTriggered){
              this.setIsTriggeredToday(true);
            }
            this.getDailyMap().set(index, new PriceTrigger(cents, isTriggered && index === currentIndex ?1:0, date));
          });
          return resolve(isTriggered);
        }).catch(err => {
          this.getLogger().debug('Could not fetch todays prices, error : ', err);
          return reject(false);
        });
      }).catch(error => {
        this.getLogger().debug('Tibber: Could not determine trigger ', error);
        return reject(false);
      });
    });
  }

  getLowestPriceHours():number{
    return this.lowestPriceHours;
  }


  getTibberLoadingBatteryEnabled():boolean{
    return this.tibberLoadBatteryEnabled;
  }

  getThresholdEur(){
    return this.thresholdEur;
  }

  getThresholdTotalEur(){
    return this.thresholdTotalMinEur;
  }


  getIsTriggeredToday(){
    return this. triggerdToday;
  }

  setIsTriggeredToday(trigger:boolean){
    this.triggerdToday = trigger;
  }

  // check if we have the lowest energy price for today - if yes, raise the trigger
  _getTrigger(todaysLowestPrice: number,
    todaysHighestPrice: number,
    todaysHighestPriceHour: number,
    lowestPriceUntilPeakHours: number,
    currentPrice: number,
    socBattery: number,
    socLowerThreshold: number): boolean {
    if (socBattery<0){
      this.getLogger().debug('battery not checked correctly ');
      return false;
    }
    const diffToLowestForToday = currentPrice - todaysLowestPrice; // difference to lowest price of today

    // check if diffToLowest is in acceptable range
    this.getLogger().debug('lowest today: ' + todaysLowestPrice + ' current: ' + currentPrice + ' diffToLowest: ' + diffToLowestForToday +
         ' thresholdTotalMinEur: ' + this.thresholdTotalMinEur + ' thresholdTotalMaxEur: ' + this.thresholdTotalMaxEur);

    if (diffToLowestForToday <= this.getThresholdEur()
        && (socBattery <= socLowerThreshold )
        && (currentPrice <= this.getThresholdTotalEur()) ) {
      this.getLogger().debug('trigger price to pump with low price: true');
      return true;
    }

    // peak protection
    // e.g. high peak 11:00 50 ct, lowest prices until now  = 11:00 at 06:00 -> 20 ct;
    // trigger if :
    //    peak expected today (generally)
    //    current hour is before peak hour, and not after
    //    current price is within low befor peak hours
    const highPeakExpectedToday = todaysHighestPrice >= this.getMinPrice();
    const currentHourBeforePeak = new Date().getHours() < todaysHighestPriceHour;
    const diffCurrentToLowWithinHours = currentPrice - lowestPriceUntilPeakHours; // lowest price until peak hour

    // if the highest price at some point today is higher than this.getMinPrice(),
    //  pull the trigger if the current price is at the lowest point range
    if ( (socBattery <= socLowerThreshold ) && // battery below threshold &&
        ( highPeakExpectedToday ) && // we have a high price within today
        ( currentHourBeforePeak ) && // current hour is one hour before peak hour
        (diffCurrentToLowWithinHours <= this.getThresholdEur()) // current price is within threshold of lowest before high time
    ) {
      this.getLogger().debug('trigger price to save from higher price trends : true');
      return true;
    }
    this.getLogger().debug('trigger price: false');
    return false;
  }




}

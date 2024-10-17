
export class AlphaTrigger {
  trigger: number;
  date:Date;
  tibberTriggerLoading: boolean;

  constructor(trigger:number, tibberTriggerLoading: boolean, date:Date){
    this.trigger = trigger;
    this.date = date;
    this.tibberTriggerLoading = tibberTriggerLoading;
  }
}

export interface AlphaServiceEventListener<T> {
  onResponse(response: T);
  getName();
}

export class PriceTrigger {
  price: number;
  trigger: number;
  date: Date;
  loadingTrigger: boolean;

  constructor(price:number, trigger:number, date:Date){
    this.price = price;
    this.trigger = trigger;
    this.date = date;
  }
}


export class AlphaData {
  soc: number;
  ppv: number;
  timeStamp: string;

  constructor(soc:number, ppv:number, timeStamp: string){
    this.ppv = ppv;
    this.soc = soc;
    this.timeStamp = timeStamp;
  }
}

export class TriggerStatus {
  lastTriggerStart: Date; // last date the trigger starts
  lastTriggerStop: Date;  // last date the trigger stops
  status: boolean;

  constructor(lastTriggerStart:Date | null, lastTriggerStop:Date | null, status:boolean){
    this.status = status;
    this.lastTriggerStart = lastTriggerStart;
    this.lastTriggerStop = lastTriggerStop;
  }


}

export class TriggerConfig {

  powerLoadingThreshold:number; // Powerload in Watts to trigger de/trigger

  powerLoadingThresholdSecondsLower:number; // Powerload seconds lower, eg. at least 10s to trigger up -> down

  powerLoadingThresholdSecondsUpper:number; // Powerload seconds higher, eg. at least 20s to trigger down -> up

  socLoadingThreshold; // soc Loading threshold

  constructor(powerLoadingThreshold:number, // power Loading Threshold
    powerLoadingThresholdSecondsLower:number, // number of seconds from up -> down
    powerLoadingThresholdSecondsUpper:number, // number of seconds from down -> up
    socLoadingThreshold:number){
    this.powerLoadingThreshold = powerLoadingThreshold;
    this.powerLoadingThresholdSecondsLower= powerLoadingThresholdSecondsLower;
    this.powerLoadingThresholdSecondsUpper = powerLoadingThresholdSecondsUpper;
    this.socLoadingThreshold = socLoadingThreshold;
  }
}

export class SettingsData{
  settingsUnloading: Map<string, unknown>;
  settingsLoading: Map<string, unknown>;
  constructor(settingsUnloading, settingsLoading){
    this.settingsLoading = settingsLoading;
    this.settingsUnloading = settingsUnloading;
  }

}
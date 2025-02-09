
# Alpha - ESS Homebridge Plugin

Connecting Alpha ESS OpenAPI Account with your homebridge and automate!

[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

<img src="Screen.png" width="800"/>

This plugin connects the alpha ess open cloud api (https://open.alphaess.com/) to your homebridge and provides values from the Alpha ESS System as sensors:
 - the current battery percentage (SOC) as humidity sensor (0-100)% 
 - the current string power (dc+ac combined) as light sensor (watts = lux) 
 - the current feed-in power as light sensor (watts = lux). negative - energy going into the net, positive fetching from the net
 - the current consumed power as light sensor (watts = lux).  
 - a contact sensor that is triggered, when the following thresholds are met:
   - power poading threshold (the generated sun power), eg. 1500w 
   - soc threshold , eg. 10% 
   this enables smart loading of ev batteries depending on the sun. thresholds are configurable
More features:

- mqtt messaging included - push energy & battery status and trigger status to mqtt
- image rendering 1: daily status of battery soc, sun power
- image rendering 2: status of alpha and tibber trigger
  
# Support me

- https://ko-fi.com/zerwuff

# Building 

 -  npm run build && npm test

# Releasing

 - 
npm version minor && npm publish
# Features 

 - Show Battery Percentage  (currently as as humidity sensor to enable percentage view)


# Installation in Homebridge:

Install via plugins in the Homebridge Ui, search for :
``` 
 homebridge-alphaess
```

# Installation in Homebridge:
Register App Id and Secret via 

https://open.alphaess.com/ and use this for the configuration: 


 # Configuration
```js
    plattforms: [
     {
            "name": "AlphaEssPlatform",
            "platform": "AlphaEssPlatform",
            "alphaUrl":"https://openapi.alphaess.com/api", 
            "appid": "XXXX",  # https://open.alphaess.com/ -> App Id 
            "appsecret": "XXXX",  # https://open.alphaess.com/ -> App Secret 
            "serialnumber": "AE31005xxxxxxxx",    # your Serial number
            "logrequestdata": "false",        
            "powerLoadingThreshold": 1500, # generated sun power in watts to enable trigger
            "socLoadingThreshold": 42,     # lower threshold of soc to enable trigger. 
            "refreshTimerInterval": 300000,  # refresh time intervall in ms. too low time will block requests by alpha backend.  
            "mqtt_url": "http://localhost:bla"
            "mqtt_status_topic": "/topic_for_alpha_ess_status_information",  # 
            "mqtt_trigger_topic_true": "/topic/to/on",
            "mqtt_trigger_topic_false": "/topic/to/off)",q
            "mqtt_trigger_message_true": "ON",
            "mqtt_trigger_message_false": "OFF",
            "power_image_filename":"/tmp/somefilename.png", # rendered output of todays statistics (PV & battery) - for camera / image exposing  

            # tibber : experimental !        
            "tibberEnabled": true,
            "tibberUrl": "https://api.tibber.com/v1-beta/gql",
            "tibberAPIKey": "<your tibber api key>",
            "tibberThresholdSOC": 60,  // battery threshold on below that tibber loading is triggered. 
            "tibberThresholdEur": 0.02,  // tibber threshold (+/-) in euro that will still enable the tibber trigger. e.g. current tibber price is 20 cents,  [18...22] cents will trigger it  
            "triggerImageFilename": "/tmp/tibber_image.png" // rendering image of alpha and tibber trigger          
        }
    ],

```

Note: all mqtt_* parameters are optional if you do not want to use an mqtt broker.

##  MQTT Configuration parameters:

 - `mqtt_url` : a complete mqtt url, including username or password to the mqtt server. if this is omitted, no connection to mqtt is done and the 
following parameters are ignored.

 - `mqtt_status_topic` :  a topic name where alpha ess status data is sent to. currently, upon every data update, the following packet is sent to the topic:
```js
  
  { 
    "Time": "2023-02-27T15:08:20.818", 
    "ALPHA": 
    {
     "soc" : 33 ,        #  % of battery soc
     "totalPower": 5000  # total power of watts from the alpha ess system (ac & dc combined)
    } 
  }

```   

 - `mqtt_trigger_topic_true` :  a topic name where a trigger information is pushed to if the trigger condition is met 
 - `mqtt_trigger_message_true` :  a static message that is pushed to the mqtt_trigger_topic_true indicating that the trigger is met
 - `mqtt_trigger_topic_false` :  a topic name where a trigger information is pushed to if the trigger condition is not met 
 - `mqtt_trigger_message_false` :  a static message that is pushed to the mqtt_trigger_topic_true indicating that the trigger is not met



## Image Rendering
If you would like to see the rendered images on your home app, please install the Camera FFMpeg plugin which will show the images as cameras and extend the plattforms configuration like this: 

```
    plattforms: [
  {
  // alpha ess configuration
  },

 {
            "name": "Camera FFmpeg",
            "videoProcessor": "/usr/local/bin/ffmpeg",
            "cameras": [
                {
                    "name": "AlphaESS",
                    "unbridge": false,
                    "videoConfig": {
                        "source": "-f image2 -loop 1 -s 640x360 -pix_fmt yuvj422p -i /tmp/alpha_power_image.png",
                        "stillImageSource": "-i file:///tmp/alpha_power_image.png",
                        "audio": false
                    }
                },
                {
                    "name": "Trigger",
                    "unbridge": false,
                    "videoConfig": {
                        "source": "-f image2 -loop 1 -s 640x360 -pix_fmt yuvj422p -i /tmp/tibber_image.png",
                        "stillImageSource": "-i file:///tmp/tibber_image.png",
                        "audio": false
                    }
                }
            ],
            "platform": "Camera-ffmpeg"
        }
]
```

##  Tibber is new experimental:

Provides a new combined trigger that is raised if Alpha or Tibber trigger is fired. Also, rendering for that trigger is possible.

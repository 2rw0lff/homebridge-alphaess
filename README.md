

# Alpha - ESS Hombridge Plugin

This plugin connects the alpha ess cloud to homebridge.


# Building 

 -  npm build && npm test

# Releasing

 - npm version minor && npm publish

# Features 

 - Show Battery Percentage  (currently as light bulb to enable percentage view)


# Installation in Homebridge:

Install via plugins in the Homebridge Ui, search for :
```
 homebridge-alphaess
```

Click install and do the following configuration:

 # Configuration
```js

    plattforms: [
     {
            "name": "AlphaEssPlatform",
            "platform": "AlphaEssPlatform",
            "username": "XXXX",
            "password": "XXXX",
            "serialnumber": "AE3100520050057",        
            "logrequestdata": "false",        
            "powerLoadingThreshold": 1500, # generated sun power in watts to enable trigger
            "socLoadingThreshold": 10,    # lower threshold of soc to enable trigger
            "refreshTimerInterval": 60000,  # refresh time intervall in ms       
            "mqtt_url": "http://localhost:bla"
            "mqtt_trigger_topic_true": "/topic/to/on",
            "mqtt_trigger_topic_false": "/topic/to/off)",
            "mqtt_trigger_message_true": "ON",
            "mqtt_trigger_message_false": "OFF"
        }
    ],

```
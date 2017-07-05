var http = require('http');
var https = require('https');
var querystring = require('querystring');
var fs = require('fs');
var request = require('request');
var Cookie = require('request-cookies').Cookie;
var documentClient = require('documentdb').DocumentClient;
var twilio = require('twilio');

var config = {}
config.endpoint = process.env.DBENDPOINT;
config.primaryKey = process.env.DBKEY;

config.database = {
    "id": process.env.DBID
};

config.collection = {
    "id": process.env.DBCOL
};

var client = new documentClient(config.endpoint, { "masterKey": config.primaryKey });

var accountSid =  process.env.TWILIOSID; // Your Account SID from www.twilio.com/console
var authToken = process.env.TWILIOAUTH;   // Your Auth Token from www.twilio.com/console

var smsClient = new twilio(accountSid, authToken);

var databaseUrl = `dbs/${config.database.id}`;
var collectionUrl = `${databaseUrl}/colls/${config.collection.id}`;

var initialLogin1 = 'https://connect.garmin.com/en-US/signin?service=https://connect.garmin.com/modern/';
var initialLogin2 = 'https://sso.garmin.com/sso/login?service=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F&webhost=olaxpw-conctmodern011.garmin.com&source=https%3A%2F%2Fconnect.garmin.com%2Fen-US%2Fsignin&redirectAfterAccountLoginUrl=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F&redirectAfterAccountCreationUrl=https%3A%2F%2Fconnect.garmin.com%2Fmodern%2F&gauthHost=https%3A%2F%2Fsso.garmin.com%2Fsso&locale=en_US&id=gauth-widget&cssUrl=https%3A%2F%2Fstatic.garmincdn.com%2Fcom.garmin.connect%2Fui%2Fcss%2Fgauth-custom-v1.2-min.css&privacyStatementUrl=%2F%2Fconnect.garmin.com%2Fen-US%2Fprivacy%2F&clientId=GarminConnect&rememberMeShown=true&rememberMeChecked=false&createAccountShown=true&openCreateAccount=false&usernameShown=false&displayNameShown=false&consumeServiceTicket=false&initialFocus=true&embedWidget=false&generateExtraServiceTicket=false&globalOptInShown=false&globalOptInChecked=false&mobile=false&connectLegalTerms=true';
var postAuth = 'https://connect.garmin.com/modern/?';

var form = {
    'username': process.env.USER,
    'password': process.env.PASS,
    'embed':'false',    
};

var docObj = {
    "dateLogged": "",
    "day": "",
    "calories":0,
    "steps": 0,
    "distance": 0.0,
    "floors": 0,
    "moderateIntensityMins": 0,
    "vigourousIntensityMinutes": 0,
    "activeCalories": 0,
    "weight": 0.0,
    "minHeartRate": 0,
    "maxHeartRate": 0,
    "restHeartRate": 0,
    "VO2MAX": 0,
    "sleepDuration": 0.0,
    "beers": 0,
    "virus": "N",
    "predictVirus": "N",
    "score": 0.0
}


Date.prototype.yyyymmdd = function() {
  var mm = this.getMonth() + 1; // getMonth() is zero-based
  var dd = this.getDate();

  return [this.getFullYear(),
          (mm>9 ? '' : '0') + mm,
          (dd>9 ? '' : '0') + dd
         ].join('-');
};

var offset = 0; //updated back to 12pm - gives the morning for final sync from the previous day to occur before moving onto the new day in the afternoon - this is based on server time.
var smsThreshold = 35; // send sms if confidence is less than 65% and an sms hasn't already been sent for this day.

var minms = (60*1000); //milliseconds in a minute
var hrms = (60*minms); //milliseconds in an hour
var dms = (24*hrms); //milliseconds in a day
var d = new Date();
var utc = d.getTime() + (d.getTimezoneOffset() * minms);
var nd = new Date(utc + (hrms*offset));
var lastWeek = new Date(utc + (hrms*offset) - (dms*7)); // back one week
var backThirty = new Date(utc + (hrms*offset) - (dms*30)); // back 30 days
var dayNm = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]

class garminGetter{

   constructor(){
       this.cookies = [];
       this.loginTicket = "";
       
   }

   get(uri){
        console.log(uri);
         return new Promise((good, bad)=>{
            var headers ={
                'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/1337 Safari/537.36' 
            }

            var cookieString = "";
            
            for(var cookie in this.cookies)
            {
                
                if(this.cookies[cookie].key == 'JSESSIONID'){
                   cookieString = cookieString.replace('JSESSIONID', 'sdff');
                   //console.log('No send session')
                }

                 cookieString += this.cookies[cookie].getCookieHeaderString() +"; ";
                
               
            }

            if(cookieString!=''){
                headers['Cookie'] = cookieString;
                console.log(cookieString)
            }
            

            var getObj = {
                    uri: uri, 
                    headers: headers,
                    followRedirect: false  
                                  
            }

            request.get(getObj, (err, response, body)=>{
                if(err){
                    bad(err);
                    return;
                }
                
                var rawcookies = response.headers['set-cookie'];

                
                for (var i in rawcookies) {
                    var cookie = new Cookie(rawcookies[i]);
                    
                    this.cookies.push(cookie);
                    console.log(cookie.key, cookie.value, cookie.expires);
                }          

                good(response.body);
                
            });

         });
   }

    post(uri, form){
         return new Promise((good, bad)=>{
            var headers ={
                'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/1337 Safari/537.36' 
            }

            var cookieString = "";

            for(var cookie in this.cookies)
            {
                cookieString += this.cookies[cookie].getCookieHeaderString() +"; ";
            }

            headers['Cookie'] = cookieString;

            var getObj = {
                    uri: uri, 
                    headers: headers                   
            }

            if(form){
                getObj.form = form;
            }

            request.post(getObj, (err, response, body)=>{
                if(err){
                    bad(err);
                    return;
                }

                var r = response.body.match(/ticket=(.*)\"/gm);
                var ticket = r[0].trim().replace("\"", "");
                this.loginTicket = ticket;
                var rawcookies = response.headers['set-cookie'];
                for (var i in rawcookies) {
                    var cookie = new Cookie(rawcookies[i]);

                    this.cookies.push(cookie);
                   
                }          

                good(response.body);
                
            });

         });
   }

}

function extractVal(val) {
    // map value
    return (val!=null && val[0].value!=null)?val[0].value:0;
}


module.exports = function (context, myTimer) {

    if(myTimer.isPastDue)
    {
        context.log('JavaScript is running late!');
    }
    context.log('JavaScript HTTP trigger function processed a request.');

    var g = new garminGetter();
    g.get(initialLogin2).then(function(good){
            g.post(initialLogin2, form).then(function(good2){
                if(!g.loginTicket){
                    context.log("No ticket!")
                }else{
                    context.log(nd);
                    context.log("Ticket is good");
                    var tix = g.loginTicket;
                    context.log(tix);

                    g.get(`${postAuth}${tix}`).then(function(good3){
                        g.get("https://connect.garmin.com/modern/").then(function(good4){
                            //context.log(good4);
                            g.get("https://connect.garmin.com/modern/proxy/userstats-service/wellness/daily/"+process.env.GarminUser+"?fromDate="+nd.yyyymmdd()+"&untilDate="+nd.yyyymmdd()).then(function(good5){
                                context.log(good5);

                                try {
                                
                                    var garminData = JSON.parse(good5);
                                    docObj.day = dayNm[nd.getDay()];
                                    
                                    var mm = garminData.allMetrics.metricsMap;

                                    docObj.dateLogged=nd.yyyymmdd()+'T00:00:00.0000000Z';
                                    docObj.calories = extractVal(mm.COMMON_TOTAL_CALORIES);
                                    docObj.steps = extractVal(mm.WELLNESS_TOTAL_STEPS);
                                    docObj.distance =parseFloat((extractVal(mm.WELLNESS_TOTAL_DISTANCE)/1000).toFixed(1));
                                    docObj.floors = extractVal(mm.WELLNESS_FLOORS_ASCENDED);
                                                                        
                                    docObj.moderateIntensityMins = extractVal(mm.WELLNESS_MODERATE_INTENSITY_MINUTES);
                                    docObj.vigourousIntensityMinutes= extractVal(mm.WELLNESS_VIGOROUS_INTENSITY_MINUTES);
                                    docObj.activeCalories= extractVal(mm.WELLNESS_ACTIVE_CALORIES);

                                    //docObj.weight": 0.0,
                                    docObj.minHeartRate=extractVal(mm.WELLNESS_MIN_HEART_RATE);
                                    docObj.maxHeartRate=extractVal(mm.WELLNESS_MAX_HEART_RATE);
                                    docObj.restHeartRate=extractVal(mm.WELLNESS_RESTING_HEART_RATE);
                                    //docObj.VO2MAX": 0,
                                    docObj.sleepDuration=parseFloat((extractVal(mm.SLEEP_SLEEP_DURATION)/60/60).toFixed(1));
                                    
                                } catch (error) {
                                    context.error(error);
                                }

                                if (docObj.steps>0) {
                                    //only continue if we have data from Garmin - don't process further if date is in the future or data hasn't been synced from watch yet

                                    // get the last VO2MAX reading from the last 30 days
                                    g.get("https://connect.garmin.com/modern/proxy/userstats-service/activities/all/"+process.env.GarminUser+"?fromDate="+backThirty.yyyymmdd()+"&untilDate="+d.yyyymmdd()).then(function(good6){
                                            context.log(good6);
                
                                            try {
                                                var activityData = JSON.parse(good6);
                                                // get the last VO2MAX value in the dataset as the most recent one
                                                docObj.VO2MAX= activityData.allMetrics.metricsMap.ACTIVITY_VO2_MAX[activityData.allMetrics.metricsMap.ACTIVITY_VO2_MAX.length-1].value;
                                            } catch (error) {
                                                context.error(error);
                                            }

                                            // weight isn't logged everyday just get the most recent weight from 1 week ago to 1 week in the future and grab the first weight as the most recent
                                            g.get("https://connect.garmin.com/modern/proxy/userprofile-service/userprofile/personal-information/weightWithOutbound/filterByDay?from="+lastWeek.getTime()+"&until="+d.getTime()+"&_=1496970141638").then(function(good7){
                                                    context.log(good7);
                        
                                                    try {
                                                        var weightData = JSON.parse(good7);
                                                        docObj.weight= parseFloat((weightData[0].weight/1000).toFixed(1));
                                                    } catch (error) {
                                                        context.error(error);
                                                    }

                                                    // get the beer tally for the day from untappd after I get access to the api
                                                    g.get("https://api.untappd.com/v4/user/checkins/"+process.env.UntappdUser+"?client_id="+process.env.UntappdClient+"&client_secret="+process.env.UntappdSecret).then(function(good8){
                                                        context.log(good8);
                                                        var beerCount=0;
                                                        try {
                                                            var untappdData = JSON.parse(good8);
                                                            if (untappdData && untappdData.response && untappdData.response.checkins && untappdData.response.checkins.items) {

                                                                var beers = untappdData.response.checkins.items.forEach(function(checkin){
                                                                    //"Sun, 25 Jun 2017 23:52:42 +0000" stored in GMT time

                                                                    var chkD = new Date(checkin.created_at); 
                                                                    //chkD.setHours(0,0,0,0); // remove the time element

                                                                    // use the offset for date adjustment from GMT time
                                                                    var nd = new Date(chkD.getTime() - (minms*chkD.getTimezoneOffset()));
                                                                    var objD = new Date(docObj.dateLogged);

                                                                    
                                                                    if ((+chkD>+objD)&&(+chkD<(+objD+dms))){
                                                                        // compare the time in mili seconds to count beers that ocurred after the dateLogged but before dateLogged + 1 day  
                                                                        beerCount++;
                                                                    }
                                
                                                                });

                                                                docObj.beers = beerCount;
                                                            }
                                                            
                                                        } catch (error) {
                                                            context.error(error);
                                                        }
                                                        // call the AzureML Service
                                                        buildFeatureInput(context); 
                                                    });
                                                    
                                            });
            
                                    });
                                };
                                
                            });
                        });
                    });
                }
            });
    }); 
    
    
};

function getPred(data,context) {
    var dataString = JSON.stringify(data)

    var host = process.env.MLDOMAIN
    var path = process.env.MLPATH
    var method = 'POST'
    var api_key = process.env.MLKEY
    var headers = {'Content-Type':'application/json', 'Authorization':'Bearer ' + api_key};
    
    var options = {
    host: host,
    port: 443,
    path: path,
    method: 'POST',
    headers: headers
    };
    
    var reqPost = https.request(options, function (res) {
        
        res.on('data', function(d) {
            //process.stdout.write(d);

            try {
                // check the scored label and probability back from Azure ML and load it into the object
                var scoreData = JSON.parse(d);
                docObj.predictVirus = scoreData.Results.output1.value.Values[0][13]; // navigate to the prediction
                docObj.score = parseFloat((scoreData.Results.output1.value.Values[0][14]*100).toFixed(2)); // navigate to the confidence score and turn it into a percentage

            } catch (error) {
                context.error(error);
            }

            client.queryDocuments(
            collectionUrl,
            'SELECT * FROM c where c.dateLogged = "'+docObj.dateLogged+'"'
            ).toArray((err, results) => {
                if (err) reject(err)
                else {
                    if (results.length==0){
                        // there isn't a document for this day create it

                        if ((docObj.predictVirus=='Y')||(docObj.score>smsThreshold)){
                            sendSickSMS(context); // send this if the prediciton is that I have a virus or my confidence is less than 65% and an sms hasn't already been sent for this day.
                            docObj.sentSMS = 'Y';
                        }

                        client.createDocument(collectionUrl, docObj, (err, created) => {
                            if (err) reject(err)
                            
                            context.done();
                        });
                    }
                    else {
                        for (var queryResult of results) {
                            let resultString = JSON.stringify(queryResult);
                            context.log(`\tQuery returned ${resultString}`);

                            if (((docObj.predictVirus=='Y')||(docObj.score>smsThreshold)) && (!queryResult.sentSMS)){
                                sendSickSMS(context); // send this if the prediciton is that I have a virus or my confidence is less than 65% and an sms hasn't already been sent for this day.
                                docObj.sentSMS = 'Y';
                            }
                            else if (queryResult.sentSMS) {
                                // we have already sent an sms for this day pass that through to the new document
                                docObj.sentSMS = queryResult.sentSMS;
                            }

                            replaceDocument(queryResult);
                        }
                        context.done();
                    }
                }
            });
        });
    });
    
    // Would need more parsing out of prediction from the result
    reqPost.write(dataString);
    reqPost.end();
    reqPost.on('error', function(e){
    context.error(e);
    });

}

function sendSickSMS(context) {
    var bodyStr = "On "+(new Date(docObj.dateLogged)).toDateString()+" I predicted that you were"+((docObj.predictVirus=='N')?" not":"")+" sick with "+((docObj.predictVirus=='N')?((100-docObj.score) | 0):((docObj.score) | 0))+"% confidence.\n\nHR: ("+docObj.minHeartRate+","+docObj.restHeartRate+","+docObj.maxHeartRate+")\nSteps: "+docObj.steps+"\nExercise: "+docObj.vigourousIntensityMinutes+" mins\nSleep: "+docObj.sleepDuration+" hrs\nBeers: "+docObj.beers;

    smsClient.messages.create({
        body: bodyStr,
        to: process.env.SMSNUMTO,  // Text this number
        from: process.env.SMSNUMFROM // From a valid Twilio number
    })
    .then((message) => context.log(message.sid));
}

function replaceDocument(document) {
    let documentUrl = `${collectionUrl}/docs/${document.id}`;

    docObj.id = document.id;
    return new Promise((resolve, reject) => {
        client.replaceDocument(documentUrl, docObj, (err, result) => {
            if (err) reject(err);
        });
    });
};

//This is the data that needs to be passed to the Azure ML web service.
function buildFeatureInput(context){
    var data = {
    "Inputs": {
    "input1": {
    "ColumnNames": ["dateLogged","day","sleepDuration","activeCalories","floors","maxHeartRate","minHeartRate","moderateIntensityMins","restHeartRate","calories","distance","steps","vigourousIntensityMinutes","VO2MAX","weight","beers","virus"],
    "Values": [ [nd.yyyymmdd()+"T00:00:00Z", docObj.day, docObj.sleepDuration, docObj.activeCalories, docObj.floors, docObj.maxHeartRate, docObj.minHeartRate, docObj.moderateIntensityMins,docObj.restHeartRate,docObj.calories,docObj.distance, docObj.steps,docObj.vigourousIntensityMinutes,docObj.VO2MAX, docObj.weight,docObj.beers,docObj.virus], ]    
    },
    },
    "GlobalParameters": {}
    }
    getPred(data,context);
}



function send404Reponse(response) {
response.writeHead(404, {'Context-Type': 'text/plain'});
response.write('Error 404: Page not Found!');
response.end();
}

function onRequest(request, response) {
if(request.method == 'GET' && request.url == '/' ){
response.writeHead(200, {'Context-Type': 'text/plain'});
fs.createReadStream('./index.html').pipe(response);
}else {
send404Reponse(response);
}
}
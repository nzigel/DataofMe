// This loads the environment variables from the .env file
require('dotenv-extended').load();

var restify = require('restify');
var builder = require('botbuilder');
const queryHelper = require('./queryHelper.js');
var azure = require('botbuilder-azure');
var documentClient = require('documentdb').DocumentClient;

var config = {}
config.endpoint = process.env.DOCUMENTDB_HOST
config.primaryKey = process.env.DOCUMENTDB_KEY

// ADD THIS PART TO YOUR CODE
config.database = {
    "id": process.env.DOCUMENTDB_DATABASE
};

config.collection = {
    "id": process.env.DOCUMENTDB_COLLECTION
};

var client = new documentClient(config.endpoint, { "masterKey": config.primaryKey });
var databaseUrl = `dbs/${config.database.id}`;
var collectionUrl = `${databaseUrl}/colls/${config.collection.id}`;

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

var model = process.env.LUIS_MODEL_URL; // includes timezone offset and spell check
var recognizer = new builder.LuisRecognizer(model);
var intents = new builder.IntentDialog({ recognizers: [recognizer] }).onDefault(DefaultReplyHandler);
bot.dialog('/', intents);

var DefaultReplyHandler = function (session) {
    session.endDialog(
        'Sorry, I did not understand "%s". Use sentences like "How far did I run this year?", "How many beers did I drink on weekends in January?", "What was my lowest heart rate this month?", "How much sleep did I get last night?")',
        session.message.text);
};

intents.matches('GetGarminData', [
    function (session, args, next) {
        // interpret the intent from LUIS

        queryHelper.buildDateQuery(builder.EntityRecognizer, args.entities, (err, searchQueryStr) => {
            if (err) {
                console.log(`Building search query failed with ${err}`);
            } else {

                //session.endConversation(searchQueryStr);
                client.queryDocuments(
                collectionUrl,
                searchQueryStr
                ).toArray((err, results) => {
                    if (err) console.log(err);
                    else {
                        if (results.length==0){
                            // there isn't a document returned for this query
                            console.log(`no document was returned from query ${searchQueryStr}`);
                            session.endConversation(`Opps, something went wrong, please try again`);
                        }
                        else if (results.length==1) {
                            // we have a single result for average count or sum
                            // or this could be in response to a Min / Max or last time query

                            queryHelper.buildResponseQuery(builder.EntityRecognizer, args.entities, results[0], (err, valStr) => {
                                if (err) {
                                    console.log(`Building response failed with ${err}`);
                                    session.endConversation(`Opps, something went wrong, please try again`);
                                } else {
                                    session.endConversation(valStr);
                                }
                            });
                        }
                        else if (results.length>1) {
                            // we have multiple documents returned check for virus or prediction and build carousel

                            queryHelper.buildResponseCards(builder.EntityRecognizer, args.entities, results, builder, session, (err, msgCard) => {
                                if (err) {
                                    console.log(`Building response failed with ${err}`);
                                    session.endConversation(`Opps, something went wrong, please try again`);
                                } else {
                                    // display the carousel
                                    session.send(msgCard).endDialog();
                                }
                            });
                        }
                    }
                });
            }
        });

        return next({ response: args });
    },function (session, results) {
        // perform the search and return response

        session.endDialog();
    }
]);
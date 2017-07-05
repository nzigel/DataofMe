function formatDateEntityString(dateEnt){
    // constuct filter string for azure search against each daterange in the following format (c.dateLogged >= "2017-01-01T00:00:00.0000000Z" and c.dateLogged < "2017-02-01T00:00:00.0000000Z")
    // start": "2017-06-14 20:00:00" ignore time portion
    var rngVal = null;
    var dateRangeStr = '';

    try{
        if (dateEnt.length>0) rngVal = dateEnt[0].resolution.values[0];
        else rngVal = dateEnt.resolution.values[0];
    }
    catch (error) {
    }

    if (rngVal!=null) {

        if (rngVal.value != null) {
            var dateStr = fdStr(rngVal.value);
            dateRangeStr = `(c.dateLogged = "${dateStr}")`;
        }
        else {

            var startStr = fdStr(rngVal.start);
            var endStr = fdStr(rngVal.end);
            dateRangeStr = `(c.dateLogged >= "${startStr}" and c.dateLogged < "${endStr}")`;
            
            if (startStr==endStr) {
                // start and end are the same adjust query to match
                dateRangeStr = `(c.dateLogged = "${startStr}")`;
            }
        }
    }
    return dateRangeStr;
}

function fdStr(dVal) {
    return ((dVal.indexOf(" ")!=-1)?dVal.split(" ")[0]:dVal)+'T00:00:00.0000000Z';
}

function chkEnt(entRec,ent,entNm){
    return (entRec.findAllEntities(ent, entNm).length>0);
}

function chkDay(daystr, dayEnt) {
    if (dayEnt.length>0) {
        // we either have a day or a day of the week to work with
        var daysWk = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

        dayEnt.forEach(function(de) {

                if (((de.entity.indexOf('last week') != -1) || (de.entity.indexOf('this week') != -1)) && (de.entity.indexOf('weekend') == -1)) {
                    // we have been passed in a specific date to check
                    // handle for tuesday last week and tuesday this week etc
                    // don't pick up last weekend or this weekend
                   
                    //daystr = 'c.dateLogged = "'+de.resolution.values[0].value+'T00:00:00.0000000Z"';
                    // this date will be processed in the date string section

                    return daystr; // stop processing further days as we have a set date
                }
                else {
                    daysWk.forEach(function(d) {
                            // match monday and mon from the Luis Entity - don't match month as mon 
                            if ((de.entity==d.toLowerCase()) || (de.entity==d.toLowerCase().substr(0,3))) {
                                daystr+=((daystr!='')?' or ':'')+'c.day = "'+d+'"';
                            }
                    }, this);
                    if (de.entity=='weekend') {
                        daystr+=((daystr!='')?' or ':'')+'c.day = "Saturday" or c.day = "Sunday"';
                    }
                    else if ((de.entity=='weekday')||(de.entity=='during the week')) {
                        daystr+=((daystr!='')?' or ':'')+'c.day = "Monday" or c.day = "Tuesday" or c.day = "Wednesday" or c.day = "Thursday" or c.day = "Friday"';
                    }
                    else if (de.entity=='thrs') {
                        daystr+=((daystr!='')?' or ':'')+'c.day = "Thursday"';
                    }
                }

        }, this);
    }
   return daystr;
}

function chkDate(datestr, dateEnt) {
    if (dateEnt.length>0) {
        dateEnt.forEach(function(de) {
            if ((de.entity.indexOf('weekend') !== -1) && (dateEnt.length>1)) {
                // we have received more than one date range for example "on the weekend last month" we don't want to process the weekend in this example as it was previously covered in the day of the week filter.
                // we do want to cover the date range for examples like "last weekend"
            }
            else {
                datestr+=((datestr!='')?' or ':'')+formatDateEntityString(de);
            }
        }, this);
    }
   return datestr;
}

function dayChk(er,ent){
    var dayFilterStr = '';

    dayFilterStr=chkDay(dayFilterStr,er.findAllEntities(ent, 'builtin.datetimeV2.date'));
    dayFilterStr=chkDay(dayFilterStr,er.findAllEntities(ent, 'dayoftheweek'));
    dayFilterStr=chkDay(dayFilterStr,er.findAllEntities(ent, 'builtin.datetimeV2.daterange'));

    return dayFilterStr;
}

function dateRngChk(er,ent){
    var dateFilterStr = '';

    dateFilterStr=chkDate(dateFilterStr,er.findAllEntities(ent, 'builtin.datetimeV2.daterange'));
    dateFilterStr=chkDate(dateFilterStr,er.findAllEntities(ent, 'builtin.datetimeV2.datetimerange'));
    if (dateFilterStr=='') {
        // only process the specific date if we don't already have a date range or a date time range
        dateFilterStr=chkDate(dateFilterStr,er.findAllEntities(ent, 'builtin.datetimeV2.date'));
    }

    return dateFilterStr;
}



function setFieldOperatorType (er, ent) {

    var ftStr = chkEnt(er,ent,'distance')?'distance':chkEnt(er,ent,'floors')?'floors':chkEnt(er,ent,'sleep')?'sleepDuration':chkEnt(er,ent,'beers')?'beers':'*';
    var opType = chkEnt(er,ent,'average')?'AVG':chkEnt(er,ent,'least')?'MIN':chkEnt(er,ent,'most')?'MAX':chkEnt(er,ent,'count')?'SUM':'*';

    if ((chkEnt(er,ent,'heartRate::minHeartRate'))||(chkEnt(er,ent,'heartRate::maxHeartRate'))||(chkEnt(er,ent,'heartRate::restingHeartRate'))) {
        ftStr = chkEnt(er,ent,'heartRate::minHeartRate')?'minHeartRate':chkEnt(er,ent,'heartRate::maxHeartRate')?'maxHeartRate':chkEnt(er,ent,'heartRate::restingHeartRate')?'restHeartRate':'*';
          if ((opType!='AVG')&&(!chkEnt(er,ent,'least'))&&(!chkEnt(er,ent,'most'))) {
             // if we are not looking for the average set min and max by type
             // exclude if search if for lowest resting heart rate last month etc
            if (chkEnt(er,ent,'heartRate::minHeartRate')) opType = 'MIN';
            else if (chkEnt(er,ent,'heartRate::maxHeartRate')) opType = 'MAX';
        }
    }

    if (chkEnt(er,ent,'predict')) {
        // check for when predicted as sick first as when predict is in play do this over actual sickness
        // predictVirus and score
        ftStr = 'predictVirus';
        opType = '*'; // set op type as * so all the documents when virus was predicted are returned for selected date range
    }
    else if (chkEnt(er,ent,'virus')) {
        // check for when sick
        ftStr = 'virus';
        opType = '*'; // set op type as * so all the documents when virus are returned for selected date range
    }
    else if (ftStr == '*') {
        // check for vigourIntensity and moderateIntensity minutes
        ftStr = chkEnt(er,ent,'activeMinutes::veryActiveMinutes')?'vigourousIntensityMinutes':chkEnt(er,ent,'activeMinutes::moderateActiveMinutes')?'moderateIntensityMins':'*';
    }

    var qObj = {
        'ftStr': ftStr,
        'opType': opType
    };

    return qObj

}
module.exports = {

    buildDateQuery: (er, ent, callback) => {
        // Example Query
        //'SELECT SUM(c.distance) FROM c where (c.day = "Saturday") and ((c.dateLogged >= "2017-01-01T00:00:00.0000000Z") and (c.dateLogged < "2017-02-01T00:00:00.0000000Z"))';

        var qObj = setFieldOperatorType(er,ent);
        var ft = qObj.ftStr;
        var op = qObj.opType;

        var dayQuery = dayChk(er,ent);
        var dateQuery = dateRngChk(er,ent);
        var whereQuery = ((dayQuery!='')&&(dateQuery!=''))?`WHERE (${dayQuery}) and (${dateQuery})`:(dayQuery!='')?`WHERE ${dayQuery}`:(dateQuery!='')?`WHERE ${dateQuery}`:'';
        var operatorStr = (op=='*')?'*':`${op}(c.${ft})`;
        var orderByStr = '';

        if ((op=='MIN')||(op=='MAX')) {
            // adjust the query to TOP 1 * ORDER BY so we also get the date of the event to report back

             var orderStr = (op=='MAX')? 'desc': 'asc'; // for max order descending for min order ascending by the field type selected

             operatorStr = 'TOP 1 *';
             orderByStr = ` ORDER BY (c.${ft}) ${orderStr}`;
        }

        if ((ft=='virus')||(ft=='predictVirus')) {
            // for virus or predict virus update the where clause and order by date
            if (chkEnt(er,ent,'last')) {
                // just get the last one
                operatorStr = 'TOP 1 *';
            }

            whereQuery += (whereQuery=='')?`WHERE c.${ft} = "Y"`:` and (c.${ft} = "Y")`;
            orderByStr = ` ORDER BY (c.dateLogged) desc`;
        }

        if ((ft=='vigourousIntensityMinutes')&&(chkEnt(er,ent,'last'))) {
            // looking for the last time I exercised intensly 

            operatorStr = 'TOP 1 *';
            whereQuery += (whereQuery=='')?`WHERE c.${ft} > 10`:` and (c.${ft} > 10)`; 
            // greater than 10 minutes of intense exercise 
            orderByStr = ` ORDER BY (c.dateLogged) desc`;
        }

        var searchQueryStr = `SELECT ${operatorStr} FROM c ${whereQuery}${orderByStr}`;
        
        callback(null, searchQueryStr);
    },

    buildResponseCards: (er, ent, results, builder, session, callback) => {
        var qObj = setFieldOperatorType(er,ent);
        var ft = qObj.ftStr;
        var op = qObj.opType;

        var cardMsg = new builder.Message(session).attachmentLayout(builder.AttachmentLayout.carousel);

        if (results && results.length>1) {

            try {
                var titleStr = (ft=='virus')?"Sick Day":"Virus Prediction";

                results.forEach(function(val) {
                    var sickStr='';
                    if (val.predictVirus=='Y') {
                        sickStr = "I predicted you were sick with "+((val.score) | 0)+"% confidence. You said you were "+((val.virus=='N')?"not ":"")+"sick.";
                    }
                    else {
                        sickStr = "I predicted you were not sick with "+(100-((val.score) | 0))+"% confidence. You said you were "+((val.virus=='N')?"not ":"")+"sick.";
                    }

                    cardMsg.addAttachment(
                        new builder.HeroCard(session)
                                .title(titleStr)
                                .subtitle((new Date(val.dateLogged)).toDateString())
                                .text(sickStr)
                    );
                }, this);
                callback(null, cardMsg);
            } catch (error) {
                callback(`error building cardMsg`, cardMsg);
            }
        }
        else {
            callback(`no results to process`, cardMsg);
        }
    },

    buildResponseQuery: (er, ent, val, callback) => {

        var qObj = setFieldOperatorType(er,ent);
        var ft = qObj.ftStr;
        var op = qObj.opType;
        
        var rStr = '';
        var dateStr= '';

        if (val.id!=null) {
            // we have a single document this could be in response to a Min / Max or last time query

            if ((op=='MIN')||(op=='MAX')||(op=='*')) {
                // we have a min, max or count event

                dateStr = (new Date(val.dateLogged)).toDateString();
                // log the date that the event took place

                // update val to the appropriate field type
                switch (ft) {
                    case 'distance': val = val.distance; break;
                    case 'floors': val = val.floors; break;
                    case 'sleepDuration': val = val.sleepDuration; break;
                    case 'minHeartRate': val = val.minHeartRate; break;
                    case 'maxHeartRate': val = val.maxHeartRate; break;
                    case 'restHeartRate': val = val.restHeartRate; break;
                    case 'vigourousIntensityMinutes' : val = val.vigourousIntensityMinutes; break;
                    case 'beers': val = val.beers; 
                }
            }
        }
        else if (val.$1!=null) {
            // we have a single result for average count or sum
            val = val.$1; // set the val object to the single result value
        }
        else {
            // we have an empty object returned from our query
            val = null;
        }
     
        if (val!=null) {
            try {
                if ((ft=='virus')||(ft=='predictVirus')) {
                    // we have a single sick day or virus prediction

                    var sickStr='';
                    if (val.predictVirus=='Y') {
                        sickStr = "I predicted you were sick with "+((val.score) | 0)+"% confidence";
                    }
                    else {
                        sickStr = "I predicted you were not sick with "+(100-((val.score) | 0))+"% confidence";
                    }

                    if (ft=='virus') {
                        rStr=`You said you were sick on ${dateStr}. On that day ${sickStr}`
                    }
                    else rStr=`You said you were not sick on ${dateStr}. On that day ${sickStr}`
                }
                else {
                    // we have a single string response

                    var valStr = val.toFixed(1);
                    var intStr = val.toFixed(0);
                    var avgStr = `on average you `;
                    var dayStr = ` per day`;
                    
                    switch (ft) {
                        case 'distance': rStr=((op=='MIN')||(op=='MAX'))?`you travelled ${valStr} kms on ${dateStr}`:(op=='AVG')?`${avgStr}travelled ${valStr} kms${dayStr}`:`total distance: ${valStr} kms`; break;
                        case 'floors': rStr=((op=='MIN')||(op=='MAX'))?`you climbed ${intStr} floors on ${dateStr}`:(op=='AVG')?`${avgStr}climbed ${intStr} floors${dayStr}`:`total floors climbed: ${intStr}`; break;
                        case 'sleepDuration': rStr=((op=='MIN')||(op=='MAX'))?`you slept ${valStr} hours on ${dateStr}`:(op=='AVG')?`${avgStr}got ${valStr} hours sleep${dayStr}`:`total sleep: ${valStr} hours`; break;
                        case 'minHeartRate': rStr=((op=='MIN')||(op=='MAX'))?`${intStr} bpm on ${dateStr}`:(op=='AVG')?`${avgStr}your lowest heart rate was ${intStr} bpm${dayStr}`:`lowest heart rate: ${intStr} bpm`; break;
                        case 'maxHeartRate': rStr=((op=='MIN')||(op=='MAX'))?`${intStr} bpm on ${dateStr}`:(op=='AVG')?`${avgStr}your highest heart rate was ${intStr} bpm${dayStr}`:`highest heart rate: ${intStr} bpm`; break;
                        case 'restHeartRate': rStr=((op=='MIN')||(op=='MAX'))?`${intStr} bpm on ${dateStr}`:(op=='AVG')?`${avgStr}your resting heart rate was ${intStr} bpm${dayStr}`:`resting heart rate: ${intStr} bpm`; break;
                        case 'vigourousIntensityMinutes': rStr=((op=='MIN')||(op=='MAX'))?`you exercised intensly for ${intStr} minutes on ${dateStr}`:(op=='AVG')?`${intStr}exercised intensly for ${intStr} minutes${dayStr}`:(dateStr!='')?`you exercised intensly for ${intStr} minutes on ${dateStr}`:`total minutes of intense exercise: ${intStr}`; break;
                        case 'beers': rStr=((op=='MIN')||(op=='MAX'))?`you drank ${intStr} beers on ${dateStr}`:(op=='AVG')?`${avgStr}drank ${intStr} beers${dayStr}`:`total beers: ${intStr}`; 
                    }
                    
                }
                callback(null, rStr);
            } catch (error) {
                callback(`error converting ${valStr} to number`, rStr);
            }
            
        }
        else {
            callback(`empty value returned from query`, rStr);
        }

    }
}

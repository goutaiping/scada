﻿// Filter events by view
var eventsByView = true;
// Input channel filter for event requests
var cnlFilter = null;

// Array of jQuery objects, where each element represents an event row
var eventRows = [];
// Events data age after full update
var fullDataAge = 0;
// Events data age after partial update
var partialDataAge = 0;
// Number of the last received event
var lastEvNum = 0;
// The last received event has the alternate style
var lastEvAlt = true;
// Timeout ID of the full events updating timer
var fullUpdateTimeoutID = null;
// Timeout ID of the partial events updating timer
var partUpdateTimeoutID = null;

// Displayed event count. Must be defined in Events.aspx
var dispEventCnt = dispEventCnt || 0;

// Set current view date and process the consequent changes
function changeViewDate(date, notify) {
    setViewDate(date);
    resetEvents();

    if (notify) {
        sendViewDateNotification(date);
    }
}

// Enable or disable events by view filter
function setEventsByVeiw(val) {
    eventsByView = val;
    cnlFilter = new scada.CnlFilter();
    cnlFilter.viewID = val ? viewID : 0;
    saveEventFilter();

    if (val) {
        $("#spanAllEventsBtn").removeClass("selected");
        $("#spanEventsByViewBtn").addClass("selected");
    } else {
        $("#spanAllEventsBtn").addClass("selected");
        $("#spanEventsByViewBtn").removeClass("selected");
    }
}

// Load the event filter from the cookies
function loadEventFilter() {
    var val = scada.utils.getCookie("Table.EventsByView");
    setEventsByVeiw(val != "false");
}

// Save the event filter in the cookies
function saveEventFilter() {
    scada.utils.setCookie("Table.EventsByView", eventsByView);
}

// Create detached jQuery object that represents an event row
function createEventRow(event) {
    var eventRow = $("<tr class='event'>" +
        "<td class='num'>" + event.Num + "</td>" +
        "<td class='time'>" + event.Time + "</td>" +
        "<td class='obj'>" + event.Obj + "</td>" +
        "<td class='dev'>" + event.KP + "</td>" +
        "<td class='cnl'>" + event.Cnl + "</td>" +
        "<td class='text'>" + event.Text + "</td>" +
        "<td class='ack'>" + event.Ack + "</td>" +
        "</tr>");

    if (event.Color) {
        eventRow.css("color", event.Color);
    }

    eventRow.data("num", event.Num);
    return eventRow;
}

// Append new event to the event table
function appendEvent(tableElem, event) {
    var eventRow = createEventRow(event);

    lastEvAlt = !lastEvAlt;
    if (lastEvAlt) {
        eventRow.addClass("alt");
    }

    eventRows.push(eventRow);
    tableElem.append(eventRow);
}

// Rewrite event HTML
function rewriteEvent(eventRow, event) {
    if (eventRow.data("num") == event.Num) {
        eventRow.children("td.time").text(event.Time);
        eventRow.children("td.obj").text(event.Obj);
        eventRow.children("td.dev").text(event.KP);
        eventRow.children("td.cnl").text(event.Cnl);
        eventRow.children("td.text").text(event.Text);
        eventRow.children("td.ack").text(event.Ack);
    } else {
        console.error(scada.utils.getCurTime() + " Event number mismatch");
    }
}

// Append new events to the event table starting from the specified index
function appendEvents(tableElem, eventArr, startIndex) {
    var len = eventArr.length ? eventArr.length : 0;
    for (var i = startIndex; i < len; i++) {
        appendEvent(tableElem, eventArr[i]);
    }
}

// Rewrite HTML of the events from the specified range not including the end index
function rewriteEvents(tableElem, eventArr, startIndex, endIndex) {
    for (var i = startIndex; i < endIndex; i++) {
        rewriteEvent(eventRows[i], eventArr[i]);
    }
}

// Remove events from the specified range not including the end index
function removeEvents(tableElem, startIndex, endIndex) {
    for (var i = startIndex; i < endIndex; i++) {
        eventRows[i].remove();
    }
    eventRows.splice(startIndex, endIndex - startIndex);
}

// Clear the event table
function clearEvents(tableElem) {
    tableElem.find("tr.event").remove();
    eventRows = [];
    lastEvAlt = true;
}

// Reset the event table to the default state and restart updating
function resetEvents() {
    clearEvents($("#tblEvents"));
    fullDataAge = 0;
    partialDataAge = 0;
    lastEvNum = 0;

    restartUpdatingEvents();
}

// Request and display events.
// callback is a function (success)
function updateEvents(full, callback) {
    var reqViewDate = viewDate;
    var reqCnlFilter = cnlFilter;
    var startEvNum = full ? 0 : lastEvNum + 1;
    var reqDataAge = full ? fullDataAge : partialDataAge;

    scada.clientAPI.getEvents(reqViewDate, reqCnlFilter, dispEventCnt, startEvNum, reqDataAge,
        function (success, eventArr, dataAge) {
            if (reqViewDate != viewDate || reqCnlFilter != cnlFilter) {
                // do nothing
            }
            else if (success) {
                var tableElem = $("#tblEvents");
                var eventArrLen = eventArr.length ? eventArr.length : 0;

                if (full) {
                    if (eventArrLen > 0) {
                        var firstEvNum = eventArr[0].Num;
                        var firstEvInd = 0;
                        var eventRowsCnt = eventRows.length;
                        while (firstEvInd < eventRowsCnt && eventRows[firstEvInd].data("num") < firstEvNum) {
                            firstEvInd++;
                        }

                        var eventsToMerge = eventRowsCnt - firstEvInd;
                        var evNumsMatched = eventsToMerge <= eventArrLen;
                        var eventRowInd = firstEvInd;
                        var eventArrInd = 0;
                        while (eventRowInd < eventRowsCnt && eventArrInd < eventArrLen && evNumsMatched) {
                            evNumsMatched = eventRows[eventRowInd].data("num") == eventArr[eventArrInd].Num;
                            eventRowInd++;
                            eventArrInd++;
                        }

                        if (evNumsMatched) {
                            // merge received events with the existing
                            removeEvents(tableElem, 0, firstEvInd);
                            rewriteEvents(tableElem, eventArr, 0, eventsToMerge);
                            appendEvents(tableElem, eventArr, eventsToMerge);
                        } else {
                            // clear and fill again the event table
                            clearEvents(tableElem);
                            appendEvents(tableElem, eventArr, 0);
                        }
                    } else if (fullDataAge != dataAge) {
                        // clear the event table
                        clearEvents(tableElem);
                    }
                } else {
                    // append new events to the event table
                    appendEvents(tableElem, eventArr, 0);
                }

                partialDataAge = dataAge;

                if (full || startEvNum <= 1) {
                    fullDataAge = dataAge;
                }

                if (eventArrLen > 0) {
                    lastEvNum = eventArr[eventArrLen - 1].Num;
                }

                scada.tableHeader.update();
                callback(true);
            } else {
                callback(false);
            }
        });
}

// Start cyclic updating all displayed events
function startFullUpdatingEvents() {
    updateEvents(true, function (success) {
        if (!success) {
            notifier.addNotification(phrases.UpdateEventsError, true, notifier.DEF_NOTIF_LIFETIME);
        }

        fullUpdateTimeoutID = setTimeout(startFullUpdatingEvents, arcRefrRate);
    });
}

// Start cyclic updating newly added events
function startPartialUpdatingEvents() {
    updateEvents(false, function (success) {
        if (!success) {
            notifier.addNotification(phrases.UpdateEventsError, true, notifier.DEF_NOTIF_LIFETIME);
        }

        partUpdateTimeoutID = setTimeout(startPartialUpdatingEvents, dataRefrRate);
    });
}

// Restart updating events immediately
function restartUpdatingEvents() {
    clearTimeout(fullUpdateTimeoutID);
    clearTimeout(partUpdateTimeoutID);

    startFullUpdatingEvents();
    partUpdateTimeoutID = setTimeout(startPartialUpdatingEvents, dataRefrRate);
}

$(document).ready(function () {
    scada.clientAPI.rootPath = "../../";
    styleIOS();
    updateLayout();
    initViewDate();
    loadEventFilter();
    scada.tableHeader.create();
    notifier = new scada.Notifier("#divNotif");
    notifier.startClearingNotifications();

    if (DEBUG_MODE) {
        initDebugTools();
    }

    $(window).on("resize " + scada.EventTypes.UPDATE_LAYOUT, function () {
        updateLayout();
    });

    // process the view date changing
    $(window).on(scada.EventTypes.VIEW_DATE_CHANGED, function (event, sender, extraParams) {
        changeViewDate(extraParams, false);
    });

    // select view date on click the calendar icon
    $("#spanDate i").click(function (event) {
        selectViewDate(changeViewDate);
    });

    // parse manually entered view date
    $("#txtDate").change(function () {
        parseViewDate($(this).val(), changeViewDate);
    });

    // switch event filter
    $("#spanAllEventsBtn").click(function () {
        if (!$(this).hasClass("disabled")) {
            setEventsByVeiw(false);
            resetEvents();
        }
    });

    $("#spanEventsByViewBtn").click(function () {
        setEventsByVeiw(true);
        resetEvents();
    });

    // export events on the button click
    $("#spanExportBtn").click(function () {
        alert("Export is not implemented yet.");
    });

    // start updating events
    startFullUpdatingEvents();
    partUpdateTimeoutID = setTimeout(startPartialUpdatingEvents, dataRefrRate);
});
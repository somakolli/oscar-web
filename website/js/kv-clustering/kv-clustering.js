define(
    function (require) {
        var state = require("state");
        var $ = require("jquery");
        var tools = require("tools");
        var search = require("search");
        var pubsub = require("pubsub");
        // var search = require("search");
        var kvClustering = {
            numberOfAdditionalRefinements : 5,
            defaultExceptionProfile: '["wheelchair", "addr", "level", "toilets:wheelchair", "building", "source"]',
            closeClustering: function(queryWithoutRefinements, clearExceptions, clearRefinements){
                if(clearRefinements){
                    state.clustering.activeIncludingRefinements = [];
                    state.clustering.activeExcludingRefinements = []
                }
                if(clearExceptions){
                    state.clustering.kvExceptions = tools.SimpleHash(); // "{keyId: int, valueId: int}" -> {name : String, itemCount: int};;
                    state.clustering.kExceptions =  tools.SimpleHash(); // keyId -> {name: String, itemCount: int};
                    state.clustering.fExceptions = tools.SimpleHash(); // keyId -> {name: String, itemCount: int}
                }
                if(queryWithoutRefinements!==state.clustering.lastQueryWithoutRefinements){
                    state.clustering.activeIncludingRefinements = [];
                    state.clustering.activeExcludingRefinements = [];
                    state.clustering.lastQueryWithoutRefinements = queryWithoutRefinements;
                }
                $('#kv-content').removeClass('show active');
                $('#p-content').removeClass('show active');
                $('#k-content').removeClass('show active');
                $('#f-content').removeClass('show active');
                $('.nav-item.refinement-type.active').removeClass('active');
                state.clustering = {
                    url: state.clustering.url,
                    openedClustering : state.clustering.openedClustering,
                    kvQueryId : state.clustering.kvQueryId,
                    kQueryId : state.clustering.kQueryId,
                    pQueryId : state.clustering.pQueryId,
                    fQueryId : state.clustering.fQueryId,
                    kRefinements : tools.SimpleHash(), // keyId -> {name : String, itemCount: int}
                    pRefinements : tools.SimpleHash(), // parentId -> {name : String, itemCount: int}
                    kvRefinements : tools.SimpleHash(), // "{keyId: int, valueId: int}" -> {name: String, itemCount: int}
                    fRefinements : tools.SimpleHash(), // keyId : int -> [{valueId: int} -> {name: String, itemCount: int}]
                    keyNameMap : tools.SimpleHash(), // keyId : int -> keyName : String
                    activeIncludingRefinements: state.clustering.activeIncludingRefinements,
                    activeExcludingRefinements: state.clustering.activeExcludingRefinements,
                    kvExceptions: state.clustering.kvExceptions, // "{keyId: int, valueId: int}" -> {name : String, itemCount: int}
                    kExceptions: state.clustering.kvExceptions, // keyId -> {name: String, itemCount: int}
                    fExceptions: tools.SimpleHash(), // keyId -> {name: String, itemCount: int}
                    kDebugInfo: {},
                    pDebugInfo: {},
                    kvDebugInfo: {},
                    fDebugInfo: {},
                    debug: state.clustering.debug,
                    lastKvQuery: "",
                    lastKQuery: "",
                    lastPQuery: "",
                    lastFQuery: "",
                    lastQueryWithoutRefinements: state.clustering.lastQueryWithoutRefinements,
                    kvRefinementCount: 10,
                    kRefinementCount: 10,
                    pRefinementCount: 10,
                    fRefinementCount: 10,
                    pHasMore: false,
                    kHasMore: false,
                    kvHasMore: false,
                    fHasMore: false,
                    facetHasMore: tools.SimpleHash(), // keyId : int -> hasMoreElementsToBeFetched : bool
                    facetSizes: tools.SimpleHash(), // keyId: int -> elementsToBeFetched: int
                    exceptionProfile: state.clustering.exceptionProfile,
                    defaultFacetSize: state.clustering.defaultFacetSize
                };
                kvClustering.drawKRefinements();
                kvClustering.drawPRefinements();
                kvClustering.drawKvRefinements();
                kvClustering.drawKExceptions();
                kvClustering.drawKvExceptions();
                kvClustering.drawActiveRefinements();
                kvClustering.drawKvDebugInfo();
                kvClustering.drawKDebugInfo();
                kvClustering.drawPDebugInfo();
            },
            subscription : pubsub.subscribe("search", function (info) {
                if(info === "request started")
                    kvClustering.closeClustering($("#search_text").val());
            }),
            drawKRefinements: function(){
                const kClusteringList = $("#kClustering-list");
                kClusteringList.empty();
                let added = false;
                state.clustering.kRefinements.each(function(key, value){
                    added = true;
                    kClusteringList.append(
                        `<li class="list-group-item d-flex justify-content-between align-items-center">
                            <span class="inner-refinement">
                                ${kvClustering.formatRefinementString(value.name)}
                                <i title="include" class="fa fa-lg fa-plus-circle including-refinement refinement-button" id="k@${value.name.replace(' ', "%20")}" href="#"></i>
                                <i title="exclude" class="fa fa-lg fa-minus-circle excluding-refinement refinement-button" id="k@${value.name.replace(' ', "%20")}" href="#"></i>
                                <i title="ignore" class="fa fa-lg fa-times-circle kRefinement-exception refinement-button" id=${key} href="#"></i>
                            </span>
                            <span class = "badge badge-primary badge-pill">${value.itemCount}</span>
                         </li>`) ;
                });
                kvClustering.showMore(state.clustering.kHasMore, 'k');
                if(!added)
                    kClusteringList.append(`No refinements for this query.`);
            },
            drawPRefinements: function(){
                const pClusteringList = $("#pClustering-list");
                pClusteringList.empty();
                state.clustering.pRefinements.each(function(key, value){
                    pClusteringList.append(
                        `<li  class="list-group-item d-flex justify-content-between align-items-center">
                            <span class="inner-refinement">
                            ${kvClustering.formatRefinementString(value.name)}
                            <i title="include" class="fa fa-lg fa-plus-circle including-refinement refinement-button" id="p${value.name.replace(' ', "%20")}" href="#"></i>
                            <i title="exclude" class="fa fa-lg fa-minus-circle excluding-refinement refinement-button" id="p${value.name.replace(' ', "%20")}" href="#"></i>
                            </span>
                            <span class = "badge badge-primary badge-pill">${value.itemCount}</span>
                         </li>`) ;
                });
                kvClustering.showMore(state.clustering.pHasMore, 'p');
                if(state.clustering.pRefinements.size() === 0)
                    pClusteringList.append(`No refinements for this query.`);

            },
            drawKvRefinements: function(){
                const kvClusteringList = $("#kvClustering-list");
                kvClusteringList.empty();
                state.clustering.kvRefinements.each(function(key, value){
                    key = JSON.parse(key);
                    kvClusteringList.append(
                        `<li class="list-group-item d-flex justify-content-between align-items-center">
                            <span class="inner-refinement">
                                ${kvClustering.formatRefinementString(value.name)}
                                <i title="include" class="fa fa-lg fa-plus-circle including-refinement refinement-button" id="v@${value.name.replace(' ', "%20")}" href="#"></i>
                                <i title="exclude" class="fa fa-lg fa-minus-circle excluding-refinement refinement-button" id="v@${value.name.replace(' ', "%20")}" href="#"></i>
                                <i title="ignore" class="fa fa-lg fa-times-circle kvRefinement-exception refinement-button" id="${key.keyId}:${key.valueId}" href="#"></i>
                            </span>
                            <span class = "badge badge-primary badge-pill">${value.itemCount}</span>
                         </li>`) ;
                });
                kvClustering.showMore(state.clustering.kvHasMore, 'kv');
                if(state.clustering.kvRefinements.size() === 0)
                    kvClusteringList.append(`No refinements for this query.`);
            },
            drawFRefinements: function(){
                const facets = $("#facets");
                facets.empty();

                state.clustering.fRefinements.each(function(keyInfo, value){
                    kvClustering.drawFacet(keyInfo.key, keyInfo.keyId, value);
                });
                kvClustering.showMore(state.clustering.fHasMore, 'f');
                if(state.clustering.fRefinements.size() === 0)
                    facets.append(`No refinements for this query.`);
            },
            drawFacet: function(key, keyId, valueList) {
                const facetsDiv = $("#facets");
                key = JSON.parse(key);
                facetsDiv.append(
                    `<ul class="list-group"  id="${key.replace(":", "-")}-facet">
                                            <li class="list-group-item d-flex justify-content-between align-items-center">
                            <span class="inner-refinement">
                                <b>${kvClustering.formatRefinementString(key)}</b>
                                <i title="include" class="fa fa-lg fa-plus-circle including-refinement refinement-button" id="k@${key.replace(' ', "%20")}" href="#"></i>
                                <i title="exclude" class="fa fa-lg fa-minus-circle excluding-refinement refinement-button" id="k@${key.replace(' ', "%20")}" href="#"></i>
                            </span>
                         </li>
                     </ul>`) ;
                const keyFacet = $(`#${key.replace(":", "-")}-facet`);

                for(let value of valueList){

                    let refinementString = key + ":" + value.name;
                    keyFacet.append(
                        `<li class="list-group-item d-flex justify-content-between align-items-center">
                            <span class="inner-refinement">
                                ${kvClustering.formatRefinementString(value.name)}
                                <i title="include" class="fa fa-lg fa-plus-circle including-refinement refinement-button" id="v@${refinementString.replace(' ', "%20")}" href="#"></i>
                                <i title="exclude" class="fa fa-lg fa-minus-circle excluding-refinement refinement-button" id="v@${refinementString.replace(' ', "%20")}" href="#"></i>
                            </span>
                            <span class = "badge badge-primary badge-pill">${value.count}</span>
                         </li>`
                    );
                }
                if(state.clustering.facetHasMore.at(keyId)){
                    keyFacet.append(
                        `<li class="list-group-item d-flex justify-content-between align-items-center">
                             <i title="Load More" class="fa fa-lg fa-ellipsis-h facet-loadMore" id="${key}-${keyId}-ShowMore" href="#"></i>
                         </li>`
                    );
                    // facetsDiv.append(`<button id="${key}-${keyId}-ShowMore" class="btn facet-loadMore" style="margin-top: -20px; margin-bottom: 10px;" hidden>Load More Values</button>`)
                }
            },
            drawLoadingPlaceholders: function(count, minWidth, maxWidth, mode){
                const refinementList = $('#'+mode+'Clustering-list');
                refinementList.empty();
                const  refinementLoading = $('.'+mode+'Refinement-loading');
                refinementLoading.removeClass('hidden');
                refinementLoading.empty();
                for(let i = 0; i < count; i++){
                    refinementLoading.append(`<li class="list-group-item d-flex justify-content-between align-items-center">
                                        <div class="refinement-loading--refinement" style="width: ${minWidth+Math.floor(Math.random() * maxWidth)}px"></div>
                                        </li>`);
                }
            },
            formatRefinementString: function(refinementString){
              if(refinementString.length > 27){
                  return `<span title="${refinementString}">${refinementString.substr(0,27)}...</span>`
              }
              return refinementString;
            },
            fetchKRefinements: function(query, force){
                let exceptionString = "[";
                state.clustering.kExceptions.each(function (key, value) {
                    exceptionString += key + ",";
                });
                exceptionString += "]";
                state.clustering.kQueryId++;
                let queryRequestWithoutId = "/oscar/kvclustering/get?q=" + search.addRefinementToQuery(query) + "&rf=admin_level"
                    + "&type=k&maxRefinements=" + state.clustering.kRefinementCount + exceptionString+ '&debug=' + state.clustering.debug;

                let queryRequestWithId = queryRequestWithoutId + "&queryId=" + state.clustering.kQueryId;

                if(queryRequestWithoutId===state.clustering.lastKQuery)
                    return;

                state.clustering.kRefinements = tools.SimpleHash();
                state.clustering.kDebugInfo = {};
                kvClustering.drawKDebugInfo();
                kvClustering.drawKRefinements();
                kvClustering.drawLoadingPlaceholders(state.clustering.kRefinementCount,75, 125, 'k');
                state.clustering.lastKQuery = queryRequestWithoutId;


                $.ajax({
                    type: "GET",
                    url: state.clustering.url + "/kvclustering/get",
                    data: {'q' : kvClustering.replaceSpatialObjects(search.addRefinementToQuery(query)),
                           'rf' : 'admin_level',
                        'type': 'k',
                        'maxRefinements' : state.clustering.kRefinementCount,
                        'exceptions' : exceptionString,
                        'debug' : state.clustering.debug,
                        'queryId' : state.clustering.kQueryId,
                        'keyExceptions': state.clustering.exceptionProfile
                    },
                    dataType: 'JSON',
                    mimeType: 'application/JSON',
                    success: function (data) {
                        if(state.clustering.kQueryId!==data.queryId && !force)
                            return;

                        data.clustering.forEach(function(key){
                            state.clustering.kRefinements.insert( key.id, {name: key.name, itemCount: key.itemCount});
                        });
                        state.clustering.kHasMore = data.hasMore;
                        if(state.clustering.debug){
                            state.clustering.kDebugInfo = data.debugInfo;
                            kvClustering.drawKDebugInfo();
                        }
                        $('.kRefinement-loading').empty();
                        kvClustering.drawKRefinements();
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        tools.defErrorCB(textStatus, errorThrown);
                    }
                });
            },
            fetchPRefinements: function(query, force){
                let queryDataWithoutId = {'q' : search.addRefinementToQuery(query),
                    'rf' : 'admin_level',
                    'type': 'p',
                    'maxRefinements' : state.clustering.pRefinementCount,
                    'debug' : state.clustering.debug,
                };
                if(JSON.stringify(state.clustering.lastPQuery) === JSON.stringify(queryDataWithoutId))
                    return;
                state.clustering.pQueryId++;
                let queryDataWithId = {queryId: state.clustering.pQueryId};
                $.extend(queryDataWithId, queryDataWithoutId);
                state.clustering.pRefinements = tools.SimpleHash();
                kvClustering.drawPRefinements();
                state.clustering.pDebugInfo = {};
                kvClustering.drawPDebugInfo();
                kvClustering.drawLoadingPlaceholders(state.clustering.pRefinementCount,100, 150, 'p');
                state.clustering.lastPQuery = queryDataWithoutId;
                $.ajax({
                    type: "GET",
                    url: state.clustering.url + "/kvclustering/get",
                    data: queryDataWithId,
                    dataType: 'JSON',
                    mimeType: 'application/JSON',
                    success: function (data) {
                        state.clustering.pRefinements = tools.SimpleHash();
                        if(state.clustering.pQueryId!==data.queryId && !force)
                            return;

                        state.clustering.pHasMore = data.hasMore;

                        data.clustering.forEach(function(parent){
                            state.clustering.pRefinements.insert( parent.id, {name: parent.name, itemCount: parent.itemCount});
                        });
                        if(state.clustering.debug){
                            state.clustering.pDebugInfo = data.debugInfo;
                            kvClustering.drawPDebugInfo();
                        }
                        $('.pRefinement-loading').empty();
                        kvClustering.drawPRefinements();
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        tools.defErrorCB(textStatus, errorThrown);
                    }
                });
            },
            fetchKvRefinements: function(query, force){
                let exceptionString = "[";
                state.clustering.kvExceptions.each(function (key) {
                    key = JSON.parse(key);
                    exceptionString += "["  + key.keyId + "," + key.valueId + "],";
                });
                exceptionString += "]";

                const queryDataWithoutId = {
                    'q' : search.addRefinementToQuery(query),
                    'rf' : 'admin_level',
                    'type': 'kv',
                    'maxRefinements' : state.clustering.kvRefinementCount,
                    'exceptions' : exceptionString,
                    'debug' : state.clustering.debug,
                    'keyExceptions': state.clustering.exceptionProfile
                };

                if(JSON.stringify(queryDataWithoutId)===JSON.stringify(state.clustering.lastKvQuery))
                    return;
                state.clustering.kvQueryId++;
                let queryDataWithId = {queryId: state.clustering.kvQueryId};
                $.extend(queryDataWithId, queryDataWithoutId);

                state.clustering.kvDebugInfo = {};
                state.clustering.kvRefinements = tools.SimpleHash();
                state.clustering.kvDebugInfo = {};
                kvClustering.drawKvDebugInfo();
                kvClustering.drawKvRefinements();
                kvClustering.drawLoadingPlaceholders(state.clustering.kvRefinementCount, 100, 150, 'kv');
                state.clustering.lastKvQuery = queryDataWithoutId;
                $.ajax({
                    type: "GET",
                    url: state.clustering.url + "/kvclustering/get",
                    data: queryDataWithId,
                    dataType: 'JSON',
                    mimeType: 'application/JSON',
                    success: function (data) {
                        state.clustering.kvRefinements = tools.SimpleHash();
                        if(state.clustering.kvQueryId!==data.queryId && !force)
                            return;

                        state.clustering.kvHasMore = data.hasMore;

                        data.clustering.forEach(function(keyValueData){
                            state.clustering.kvRefinements.insert( JSON.stringify({keyId: keyValueData.keyId, valueId: keyValueData.valueId}), {name: keyValueData.name, itemCount: keyValueData.itemCount});
                        });
                        if(state.clustering.debug){
                            console.log(data.debugInfo);
                            state.clustering.kvDebugInfo = data.debugInfo;
                            kvClustering.drawKvDebugInfo();
                        }
                        $('.kvRefinement-loading').empty();
                        kvClustering.drawKvRefinements();
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        tools.defErrorCB(textStatus, errorThrown);
                    }
                });
            },
            fetchFRefinements: function(query, force){
                let exceptionString = "[";
                state.clustering.fExceptions.each(function (key) {
                    key = JSON.parse(key);
                    exceptionString += "["  + key.keyId + "," + key.valueId + "],";
                });
                exceptionString += "]";

                let facetSizesString = "[";
                state.clustering.facetSizes.each(function (keyId, facetSize){
                    facetSizesString += "[" + keyId + "," + facetSize + "],";
                });
                facetSizesString += "]";

                const queryDataWithoutId = {
                    'q' : search.addRefinementToQuery(query),
                    'rf' : 'admin_level',
                    'type': 'f',
                    'maxRefinements' : state.clustering.fRefinementCount,
                    'exceptions' : exceptionString,
                    'debug' : state.clustering.debug,
                    'keyExceptions': state.clustering.exceptionProfile,
                    'facetSizes': facetSizesString,
                    'defaultFacetSize': state.clustering.defaultFacetSize
                };
                console.log('default facet size', state.clustering.defaultFacetSize);

                if(JSON.stringify(queryDataWithoutId)===JSON.stringify(state.clustering.lastFQuery))
                    return;
                state.clustering.fQueryId++;
                let queryDataWithId = {queryId: state.clustering.fQueryId};
                $.extend(queryDataWithId, queryDataWithoutId);

                state.clustering.fDebugInfo = {};
                state.clustering.fRefinements = tools.SimpleHash();
                state.clustering.fDebugInfo = {};
                kvClustering.drawFDebugInfo();
                kvClustering.drawFRefinements();
                kvClustering.drawLoadingPlaceholders(state.clustering.fRefinementCount, 100, 150, 'f');
                state.clustering.lastFQuery = queryDataWithoutId;
                $.ajax({
                    type: "GET",
                    url: state.clustering.url + "/kvclustering/get",
                    data: queryDataWithId,
                    dataType: 'JSON',
                    mimeType: 'application/JSON',
                    success: function (data) {
                        state.clustering.fRefinements = tools.SimpleHash();
                        if(state.clustering.fQueryId!==data.queryId && !force)
                            return;

                        state.clustering.fHasMore = data.hasMore;

                        data.clustering.forEach(function(keyValueData){
                            state.clustering.fRefinements.insert(
                                {key: JSON.stringify(keyValueData.key), keyId: keyValueData.keyId}, keyValueData.values);
                            state.clustering.facetHasMore.insert( keyValueData.keyId, keyValueData.hasMore);
                        });
                        console.log('facetHasMore',state.clustering.facetHasMore);
                        if(state.clustering.debug){
                            console.log(data.debugInfo);
                            state.clustering.fDebugInfo = data.debugInfo;
                            kvClustering.drawFDebugInfo();
                        }
                        $('.fRefinement-loading').empty();
                        kvClustering.drawFRefinements();
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        tools.defErrorCB(textStatus, errorThrown);
                    }
                });
            },
            addIncludingRefinement: function(refinementName){
                state.clustering.activeIncludingRefinements.push(refinementName);
                kvClustering.drawActiveRefinements();
            },
            addExcludingRefinement: function(refinementName){
                state.clustering.activeExcludingRefinements.push(refinementName);
                kvClustering.drawActiveRefinements();
            },
            drawActiveRefinements: function() {
                const refinements = $('#refinements');
                const refinementText = $('#refinementsText');
                refinements.empty();
                let added = false;
                state.clustering.activeIncludingRefinements.forEach(function (refinementName){
                    added = true;
                  refinements.append(`<span class="badge" style="background-color: green""><span class="active-refinement" style="cursor: pointer" id=${refinementName} >x</span> ${refinementName.replace("%20"," ").slice(1)}</span>`);
                });
                state.clustering.activeExcludingRefinements.forEach(function (refinementName){
                    added = true;
                  refinements.append(`<span class="badge" style="background-color: red"><span class="active-refinement" style="cursor: pointer" id=${refinementName} >x</span> ${refinementName.replace("%20"," ").slice(1)}</span>`);
                });
                if(added){
                    refinementText.show();
                } else {
                    refinementText.hide();
                }

            },
            addKException: function(refinement){
                state.clustering.kExceptions.insert(parseInt(refinement), state.clustering.kRefinements.at(parseInt(refinement)));
                kvClustering.fetchKRefinements(search.addRefinementToQuery($("#search_text").val(), true));
            },
            addKvException: function(refinement){
                let keyValue = refinement.split(":");
                let keyValueObject = {keyId: parseInt(keyValue[0]), valueId: parseInt(keyValue[1])};
                //stringify object because object comparison does not work in javascript
                keyValueObject = JSON.stringify(keyValueObject);
                state.clustering.kvExceptions.insert(keyValueObject, state.clustering.kvRefinements.at(keyValueObject));
                kvClustering.fetchKvRefinements(search.addRefinementToQuery($("#search_text").val(), true));
            },
            drawKExceptions: function(){
                const kExceptionList = $('#kException-list');
                kExceptionList.empty();
                if(state.clustering.kExceptions.size() > 0){
                    $('#kExceptionText').show();
                } else {
                    $('#kExceptionText').hide();
                }
                state.clustering.kExceptions.each(function (key, value) {
                    kExceptionList.append(`<li>${value.name}
                                                <i title="remove" class="fa fa-lg fa-times-circle active-exception refinement-button" id=${key} href="#"></i>
                                            </li>`);
                })
            },
            drawKvExceptions: function(){
                const kvExceptionList = $('#kvException-list');
                kvExceptionList.empty();
                if(state.clustering.kvExceptions.size() > 0){
                    $('#kvExceptionText').show();
                } else {
                    $('#kvExceptionText').hide();
                }
                state.clustering.kvExceptions.each(function (key, value) {
                    key = JSON.parse(key);
                    kvExceptionList.append(`<li>${value.name}
                                                <i title="remove" class="fa fa-lg fa-times-circle active-exception refinement-button" id="${key.keyId}:${key.valueId}" href="#"></i>
                                            </li>`);
                })
            },
            drawSettings: function(){
                $('#exception-profile-settings').val(state.clustering.exceptionProfile);
            },
            drawDefaultSettings: function(){
                $('#exception-profile-settings').val(kvClustering.defaultExceptionProfile);
            },
            saveSettings: function(exceptionProfile){
                if(state.clustering.exceptionProfile !== exceptionProfile){
                    state.clustering.exceptionProfile = exceptionProfile;
                    kvClustering.closeClustering($("#search_text").val());
                }

            },
            removeKException: function(refinementId){
                refinementId = parseInt(refinementId);
                state.clustering.kExceptions.erase(refinementId);
                kvClustering.drawKExceptions();
                kvClustering.fetchKRefinements(search.addRefinementToQuery($("#search_text").val(), true));
            },
            removeKvException: function(refinementString){
                const keyId = parseInt(refinementString.split(":")[0]);
                const valueId = parseInt(refinementString.split(":")[1]);
                const refinementObject = {keyId: keyId, valueId: valueId};
                state.clustering.kvExceptions.erase(JSON.stringify(refinementObject));
                kvClustering.drawKvExceptions();
                kvClustering.fetchKvRefinements(search.addRefinementToQuery($("#search_text").val(), true));
            },
            clearKvExceptions: function(){
                state.clustering.kvExceptions = tools.SimpleHash(); // "{keyId: int, valueId: int}" -> {name : String, itemCount: int};
                kvClustering.drawKvExceptions();
                kvClustering.fetchKvRefinements(search.addRefinementToQuery($("#search_text").val(), true));
            },
            clearKExceptions: function(){
                state.clustering.kExceptions = tools.SimpleHash();
                kvClustering.drawKExceptions();
                kvClustering.fetchKRefinements(search.addRefinementToQuery($("#search_text").val(), true));
            },
            removeRefinement: function(refinement){
                for(let i = state.clustering.activeIncludingRefinements.length - 1; i >= 0; i--) {
                    if(state.clustering.activeIncludingRefinements[i] === refinement) {
                        state.clustering.activeIncludingRefinements.splice(i, 1);
                    }
                }
                for(let i = state.clustering.activeExcludingRefinements.length - 1; i >= 0; i--) {
                    if(state.clustering.activeExcludingRefinements[i] === refinement) {
                        state.clustering.activeExcludingRefinements.splice(i, 1);
                    }
                }
                kvClustering.drawActiveRefinements();
            },
            drawKDebugInfo(){
                const kDebugInfo = $('#kDebugInfo');
                kDebugInfo.empty();
                kDebugInfo.append(kvClustering.getDebugInfoString(state.clustering.kDebugInfo));
            },
            drawPDebugInfo(){
                const pDebugInfo = $('#pDebugInfo');
                pDebugInfo.empty();
                pDebugInfo.append(kvClustering.getDebugInfoString(state.clustering.pDebugInfo));
            },
            drawKvDebugInfo(){
                const kvDebugInfo = $('#kvDebugInfo');
                kvDebugInfo.empty();
                kvDebugInfo.append(kvClustering.getDebugInfoString(state.clustering.kvDebugInfo));
            },
            drawFDebugInfo(){
                const fDebugInfo = $('#fDebugInfo');
                fDebugInfo.empty();
                fDebugInfo.append(kvClustering.getDebugInfoString(state.clustering.fDebugInfo));
            },
            showMore: function(visible, mode){
                if(visible){
                    $('#' + mode + 'ShowMore').show();
                } else {
                    $('#' + mode + 'ShowMore').hide();
                }
            },
            getDebugInfoString(debugInfo){
              debugHtml = `<h4>Debug Info</h4>
                            <ul style="list-style-type: none; margin-left: -40px">
                                <li>Number of Items: ${debugInfo.itemCount}</li>
                                <li>Number of Parents: ${debugInfo.parentCount}</li>
                                <li>Number of Pairs: ${debugInfo.pairCount}</li>
                                <li>Time to generate map: ${debugInfo.timeToGenerateMap} ms</li>
                                <li>Time to sort: ${debugInfo.timeToSort} ms</li>
                                <li>Time to find first parents: ${debugInfo.timeToFindFirstParents} ms</li>
                                <li>Time to find first parents: ${debugInfo.timeToFindFirstParents} ms</li>
                                <li>Time to find other parents: ${debugInfo.timeToFindOtherParents} ms</li>
                                <li>Total time: ${debugInfo.totalTime} ms</li>
                           </ul>`;
              return state.clustering.debug ? debugHtml : "";
            },
            clearRefinements: function () {
                kvClustering.closeClustering($("#search_text").val(), false, true)
                kvClustering.drawActiveRefinements();
            },
            addFacetShowMore(id){
                // id has format: keyName-keyId-ShowMore
                const idSplittet = id.split('-');
                const key = idSplittet[0];
                const keyId = idSplittet[1];
                if(state.clustering.facetSizes.at(keyId)){
                    state.clustering.facetSizes.set(keyId, state.clustering.facetSizes.at(keyId)+5);
                }
                else{
                    state.clustering.facetSizes.insert(keyId, 15);
                }
                kvClustering.fetchFRefinements($('#search_text').val(), true)
                console.log('facetSizes', state.clustering.facetSizes);
            },
        };
        return kvClustering;
    });

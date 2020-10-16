define(["jquery", "state", "map", "conf"], function($, state, map, config) {
    var query = {
        clearSpatialQueryMapShape: function() {
            if (state.spatialquery.mapshape !== undefined) {
                state.map.removeLayer(state.spatialquery.mapshape);
                state.spatialquery.mapshape = undefined;
            }
        },
        //begin spatial query functions
        spatialQueryOnClick: function(e) {
            //reset timers
            if (state.timers.spatialquery !== undefined) {
                clearTimeout(state.timers.spatialquery);
                state.timers.spatialquery = setTimeout(query.endSpatialQuery, config.timeouts.spatialquery.select);
            }
            state.spatialquery.coords.push(e.latlng);
            if (state.spatialquery.type === "rect") {
                if (state.spatialquery.coords.length === 2) {
                    query.endSpatialQuery();
                }
            }
            else if (state.spatialquery.type === "point") {
				query.endSpatialQuery();
			}
            else {
                query.updateSpatialQueryMapShape();
            }
        },
        startSpatialQuery: function() {
            if (state.timers.spatialquery !== undefined) {
                clearTimeout(state.timers.spatialquery);
                state.timers.spatialquery = undefined;
            }
            $('#spatialquery_acceptbutton').removeClass("btn-info");
            $('#spatialquery_selectbutton').addClass("btn-info");
            $('#spatialquery_selectbutton').html("Finish");
            state.spatialquery.selectButtonState = 'finish';
            state.spatialquery.type = $('#spatialquery_type').val();
            state.map.on('click', query.spatialQueryOnClick);
            state.timers.spatialquery = setTimeout(query.endSpatialQuery, config.timeouts.spatialquery.select);
        },
        endSpatialQuery: function() {
            query.updateSpatialQueryMapShape();
            if (state.timers.spatialquery !== undefined) {
                clearTimeout(state.timers.spatialquery);
                state.timers.spatialquery = undefined;
            }
            state.map.removeEventListener('click', query.spatialQueryOnClick);
            
            state.spatialquery.selectButtonState = 'clear';
            $('#spatialquery_selectbutton').html('Clear');
            $('#spatialquery_acceptbutton').addClass('btn-info');
        },
        clearSpatialQuery: function() {
            if (state.timers.spatialquery !== undefined) {
                clearTimeout(state.timers.spatialquery);
                state.timers.spatialquery = undefined;
            }
            
            query.clearSpatialQueryMapShape();
            
            state.map.removeEventListener('click', query.spatialQueryOnClick);
            
            state.spatialquery.coords = [];
            state.spatialquery.selectButtonState = 'select';
            state.spatialquery.type = undefined;
            
            $('#spatialquery_acceptbutton').removeClass("btn-info");
            $('#spatialquery_selectbutton').removeClass("btn-info");
            $('#spatialquery_selectbutton').html('Create');
        },
        updateSpatialQueryMapShape: function() {
            //clear old mapshape
            query.clearSpatialQueryMapShape();
            if (state.spatialquery.type === undefined) {
                console.log("updateSpatialQueryMapShape called with undefined query type");
                return;
            }
            else if (state.spatialquery.type === "rect") {
                if (state.spatialquery.coords.length < 2) {
                    return;
                }
                var sampleStep = 1.0 / config.geoquery.samplecount;
                var sampleCount = config.geoquery.samplecount;
                var pts = [];
                function fillPts(sLat, sLng, tLat, tLng) {
                    var latDiff = (tLat-sLat)*sampleStep;
                    var lngDiff = (tLng-sLng)*sampleStep;
                    for(i=0; i < sampleCount; ++i) {
                        pts.push(L.latLng(sLat, sLng));
                        sLat += latDiff;
                        sLng += lngDiff;
                    }
                }
                var minLat = Math.min(state.spatialquery.coords[0].lat, state.spatialquery.coords[1].lat);
                var maxLat = Math.max(state.spatialquery.coords[0].lat, state.spatialquery.coords[1].lat);
                var minLng = Math.min(state.spatialquery.coords[0].lng, state.spatialquery.coords[1].lng);
                var maxLng = Math.max(state.spatialquery.coords[0].lng, state.spatialquery.coords[1].lng);

                fillPts(minLat, minLng, minLat, maxLng);
                fillPts(minLat, maxLng, maxLat, maxLng);
                fillPts(maxLat, maxLng, maxLat, minLng);
                fillPts(maxLat, minLng, minLat, minLng);

                state.spatialquery.mapshape = L.polygon(pts, config.styles.shapes.geoquery.normal);
            }
            else if (state.spatialquery.type === "poly") {
                state.spatialquery.mapshape = L.polygon(state.spatialquery.coords, config.styles.shapes.polyquery.highlight);
            }
            else if (state.spatialquery.type === "point") {
                let opts = Object.assign({}, config.styles.shapes.pointquery.highlight);
                if (parseInt($('#spatialquery_radius').val()) > 0) {
                    opts["radius"] = $('#spatialquery_radius').val();
                }
                state.spatialquery.mapshape = L.circle(state.spatialquery.coords[0], opts);
			}
            else if (state.spatialquery.type === "cell") {
                state.spatialquery.mapshape = L.circle(state.spatialquery.coords[0], config.styles.shapes.cellquery.highlight);
			}
            else if (state.spatialquery.type === "path") {
                state.spatialquery.mapshape = L.polyline(state.spatialquery.coords, config.styles.shapes.pathquery.highlight);
            }
            else if (state.spatialquery.type === "route") {
                if (state.spatialquery.coords.length < 2) {
                    return;
                }
                let q = "[";
                let first = true;
                for(let coord of state.spatialquery.coords) {
                    if(!first) {
                        q += ',';
                    } else {
                        first = false
                    }
                    q += '[' + coord.lat;
                    q += ',' + coord.lng + ']';
                }
                q += ']';
                $.ajax({
                    type: "GET",
                    url: "/oscar/routing/route",
                    data: 'q=' + encodeURI(q) + '&d=1000',
                    dataType: 'JSON',
                    mimeType: 'application/JSON',
                    async: false,
                    success: function (data) {
                        state.spatialquery.mapshape = L.polyline(data.path, config.styles.shapes.routequery.highlight);
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                    }
                });
            }
            state.map.addLayer(state.spatialquery.mapshape);
        }
    };

	return query;
});
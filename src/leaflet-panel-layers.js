/**
 * Map
 * Works with Leaflet
 *
 * @keyword map
 * @namespace gooltracking.list.map
 * @see http://leafletjs.com/index.html
 * @depends gooltracking.utils
 * @requires OpenLayers 3
 */
if( typeof gooltracking.list == 'undefined' )
{
    gooltracking.list = {};
}

gooltracking.list.map = (function( global, create_function )
{
    return create_function( global );
}
)( typeof window !== "undefined" ? window : this, function( global )
{
    //BEGIN
    var
    document = global.document,
    strundefined = typeof undefined,
    __package_name__ = 'map',
    fallback_icon = gooltracking.utils.url.base_url('assets/images/marker-icon.png'),
    fallback_image = gooltracking.utils.url.base_url('assets/images/no-image.png'),
    _controls_bottom_margin = 10,
    _poyline_count = 0, // total polylines displayed on map
    _point_count = 0, // total points displayed on map
    _default_layer = 0, // Position of the default layer in the base_layers array
    callbacks = {
        on_feature_selected: function(feature, layer){},
        on_popup_open: function(element, props){}
    },
    __package__ = function()
    {
        this.constructor();
    };
    __package__.prototype = {
        /**
         * Creates a vector source that will be used to render data in the map.
         * @method constructor
         */
        constructor: function(){
            this.base_layers = [];
            L.Icon.Default.imagePath = gooltracking.utils.url.base_url( 'assets/images/' );

            this.selected = [];
            this.categories = [];
            this._routes_layers = [];
            this._points_layers = {};
            this._cluster_layers = [];
            this.categories_sorting = [];
            this.get_categories_sorting_xml();
            this.fullscreen_status = false;
            this._layer_bounds = [ // Layer bounds for storing total points and polyline bounds
                new L.LatLngBounds(),
                new L.LatLngBounds()
            ];

            if( typeof window.map_config != strundefined )
            {
                _default_layer = window.map_config.default_base_layer;
            }
        },
        /**
         * Calls for the classification XML to sort the point
         * layers later on. Async.
         *
         * @method get_categories_sorting_xml
         */
        get_categories_sorting_xml: function()
        {
            var context = this;
            var xml_url = gooltracking.utils.url.base_url('xml/classification');
            $.ajax({
                type: "GET",
                url: xml_url,
                dataType: "xml",
                success: function(xml) {
                    var list = $(xml).find('id'),
                        new_list = [];
                    for(var a in list){
                        new_list.push(list[a].innerHTML);
                    }
                    context.categories_sorting = new_list;
                }
            });
        },
        /**
         * Makes a new map in the specified canvas.
         *
         * @method create
         * @param {Object} jquery canvas
         */
        create: function( canvas ){
            this.load( 'map' );
        },
        /**
         * Here the map gets rendered, it is only the first step.
         * We render the information in a second step.
         * Target is the id of the element that will contain
         * the map.
         *
         * @method load
         * @param {String} target
         */
        load: function( target ){
            var _context = this;
            this.target = target;
            var osm_layer = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://cloudmade.com">CloudMade</a>',
                maxZoom: 18
            });
            var satellite = new L.Google('HYBRID');
            var terrain = new L.Google('TERRAIN');
            var topographic = L.tileLayer.wms('http://www.ign.es/wms-inspire/ign-base',
            {
                layers: 'IGNBaseTodo',
                format: 'image/png',
                transparent: false,
                continuousWorld : true,
                attribution: '© <a href="http://www.ign.es/ign/main/index.do" target="_blank">Instituto Geográfico Nacional de España</a>'
            });
            this.base_layers = [
                        {
                            name: __trad['baselayers_map'],
                            layer: osm_layer
                        },
                        {
                            name: __trad['baselayers_satellite'],
                            layer: satellite
                        },
                        {
                            name: __trad['baselayers_terrain'],
                            layer: terrain
                        },
                        {
                            name: __trad['baselayers_topographic'],
                            layer: topographic
                        }
            ];
            this.overlays = null;
            this._map = L.map('map',
                            {
                                zoomControl: false,
                                fullscreenControl: false,
                                scrollWheelZoom: false, // initially disabled, enabled on click
                                dragging: false, // initially disabled, enabled on click
                                fullscreenControlOptions: {
                                    position: 'topleft'
                                },
                              layers: [ this.base_layers[ _default_layer ].layer ]
                            });
            this._map.setView([0, 0], 2);
            this._panelLayers = new L.Control.PanelLayers(this.base_layers, this.overlays, {button: true});
            this._map.addControl(this._panelLayers);

            L.control.scale({ position: 'bottomleft', imperial: false }).addTo(this._map);

            this._map.on('click', function(e) {
                this.scrollWheelZoom.enable();
                this.dragging.enable();
            });

            this._map.on('enterFullscreen', function () {
                _context.fullscreen_status = true;
            });
            this._map.on('exitFullscreen', function () {
                _context.fullscreen_status = false;
            });
        },
        /**
         * Gets back the target dom element where the map is
         * wrapped in jquery.
         *
         * @method get_map_target
         * @return jQuery
         */
        get_map_target: function(){
            return $( "#" + this.target );
        },
        /**
         * Gets the map size
         *
         * @method get_map_size
         * @return object{x:int,y:int}
         */
        get_map_size: function(){
            return this._map.getSize();
        },
        /**
         * From GeoJSON to our map.
         * Reads the GeoJSON features, then applies an style to them, then creates a
         * layer to display and adds it to the map. Finally zooms to the first layer.
         *
         * @method set_geojson_data
         * @param {String} data
         */
        set_geojson_data: function( data )
        {
            var features = this.geojson_divide_features( data.features );

            for(var a in data.categories)
            {
                if( typeof this.categories[a] == strundefined )
                {
                    this.categories[a] = data.categories[a];
                }
                else
                {
                    var type_type = data.categories[a];
                    var saved_type_type = this.categories[a];
                    for( var b in type_type )
                    {
                        var found = false;
                        for( var c in saved_type_type )
                        {
                            if( saved_type_type[c].id == type_type[b].id )
                            {
                                found = true;
                            }
                        }
                        if( !found )
                        {
                            this.categories[a].push( type_type[b] );
                        }
                    }
                }
            }

            var bounds  = this.make_routes_layers( features.routes, this.categories );
            var bounds2 = this.make_points_layers( features.points, this.categories );

            if( bounds && bounds2 )
            {
                bounds.extend( bounds2 );
            }
            else if( bounds2 )
            {
                bounds = bounds2;
            }
            return bounds;
        },
        /**
         * Adds the point types as layers to the layer control.
         * It sets up clustering.
         *
         * @method make_points_layers
         * @param {Array} features
         * @param {Array} categories
         * @return L.Bounds
         */
        make_points_layers: function( features, categories )
        {
            var bounds = false;
            var type_category = 'type';
            var collections = this.features_by_type( features );
            for( var a in collections )
            {
                var categ_id = collections[a].features[0].properties.categories[ type_category ];
                var category_name = this.get_category_name( categories[ type_category ], categ_id );
                var layer = this._make_geojson_layer( collections[a] );
                if( !bounds )
                {
                    bounds = layer.getBounds();
                }
                else
                {
                    bounds.extend( layer.getBounds() );
                }

                if( typeof this._points_layers[ categ_id ] == strundefined )
                {
                    this._points_layers[ categ_id ] = [];
                }
                this._points_layers[ categ_id ].push(layer);
            }

            return bounds;
        },
        /**
         * Makes a layer with all the routes.
         *
         * @method make_routes_layers
         * @param {Array} features
         * @param {Array} categories
         * @return L.Bounds
         */
        make_routes_layers: function( features, categories )
        {
            var bounds = false;
            if( features.length )
            {
                var layer = this._make_geojson_layer( { type: 'FeatureCollection', features: features } );
                layer.addTo( this._map );
                if( !bounds )
                {
                    bounds = layer.getBounds();
                }
                else
                {
                    bounds.extend( layer.getBounds() );
                }
                this._routes_layers.push(layer);
            }
            return bounds;
        },
        /**
         *
         *
         * @return L.Bounds
         */
        make_panel_layers: function()
        {
            this._map.removeControl(this._panelLayers);
            this._panelLayers = new L.Control.PanelLayers(this.base_layers, this.overlays, {button: true, collapsibleGroups: true});
            this._map.addControl(this._panelLayers);

            var layer = L.layerGroup(this._routes_layers);
            layer.addTo(this._map);
            this._panelLayers.addOverlay({
                name: __trad['routes'],
                icon: '<i class="leaflet-panel-layers-icon"><img src="' + gooltracking.utils.url.base_url('assets/images/itineraris.png') + '" /></i>',
                layer: layer
            }, __trad['routes']);


            var type_category = 'type';
            for(var category_id in this._points_layers)
            {
                var category_name = this.get_category_name( this.categories[ type_category ], category_id );
                var layers = this._points_layers[category_id];
                var cluster_layer = new L.MarkerClusterGroup({
//                     spiderfyOnMaxZoom: false,
                    disableClusteringAtZoom: 15,
                    maxClusterRadius: 60
                });
                for( var b in layers )
                {
                    cluster_layer.addLayer( layers[b] );
                }
                cluster_layer.addTo(this._map);
                this._panelLayers.addOverlay({
                    icon: this.get_category_icon( this.categories[ type_category ], category_id ),
                    layer: cluster_layer
                }, category_name, {
                    name: __trad['points'],
                    icon: this.get_points_group_icon(),
                    collapsed: true
                }, true);

                this._cluster_layers.push( cluster_layer );
            }
        },
        /**
         * Makes a layer with all the routes.
         *
         * @method make_overlay_layers
         * @param {Array} features
         * @param {Array} categories
         * @return L.Bounds
         */
        make_overlay_layers: function( overlay_list )
        {
            var group = {
                    name: __trad['overlays'],
                    icon: this.get_overlays_group_icon()
                };
            for(var a in overlay_list)
            {
                this._panelLayers.addOverlay(overlay_list[a], null, group);
                if( typeof overlay_list[a].active != strundefined && overlay_list[a].active )
                {
                    this._map.addLayer( overlay_list[a].layer );
                }
            }
        },
        /**
         * Returns the category name from a list.
         * If the title is too large, it gets cut.
         *
         * @method get_category_name
         * @param {Array} categories
         * @param {Integer} id
         * @return {String}
         */
        get_category_name: function( categories, id )
        {
            var title = "";
            var original_title;
            for( var a in categories )
            {
                if( categories[a].id == id )
                {
                    original_title = title = categories[a].title;
                }
            }
            if( title.length > 23 ) {
                title = title.substr(0,20) + "...";
            }
            // encode
            original_title = $("<div />").html(original_title).text();
            title = $("<div />").html(title).text();

            // wrap
            title = '<span title="'+ original_title +'">' + title + '</span>';

            return title;
        },
        /**
         * Returns the icon HTML string
         *
         * @method get_category_icon
         * @param {Array} categories
         * @param {Integer} id
         * @return {String}
         */
        get_category_icon: function( categories, id )
        {

            for( var a in categories )
            {
                if( categories[a].id == id )
                {
                    return "<img src='" + categories[a].image_url + "'>";
                }
            }
            // Fallback to a generic icon
            return "<img src='"+ fallback_icon +"'>";
        },
        /**
         * Sets up the icon for the points group of layers.
         *
         * @method get_points_group_icon
         * @return {String}
         */
        get_points_group_icon: function()
        {
            return "<img src='"+gooltracking.utils.url.base_url('assets/images/interes.png')+"' />";
        },
        /**
         * Sets up the icon for the overlays group.
         *
         * @method get_overlays_group_icon
         * @return {String}
         */
        get_overlays_group_icon: function()
        {
            return "<img src='"+gooltracking.utils.url.base_url('assets/images/layers_icon.png')+"' />";
        },
        /**
         * Takes a list of features and divides them by their type.
         * Then the features are groupd in JSON styled FeatureCollections.
         * Then sorted.
         *
         * @method features_by_type
         * @param {Array} data
         * @return {Array}
         */
        features_by_type: function( data )
        {
            var categories = [];
            for(var a in data)
            {
                var f = data[ a ];
                if( typeof categories[ f.properties.categories.type ] == strundefined )
                {
                    categories[ f.properties.categories.type ] = [];
                }
                categories[ f.properties.categories.type ].push( f );
            }

            var result = [];
            for(var a in categories)
            {
                result.push({
                    type: 'FeatureCollection',
                    features: categories[ a ],
                    category: a
                });
            }

            result = this.sort_collections_by_category( result );
            return result;
        },
        /**
         * Given a categories sorting array it sorts the
         * collections by their category.
         *
         * @method sort_collections_by_category
         * @param {Array} collections
         * @return {Array}
         */
        sort_collections_by_category: function( collections )
        {
            var list = this.categories_sorting;
            if( !list )
            {
                return collections;
            }
            collections.sort(function(a, b){
                return list.indexOf( a.category ) - list.indexOf( b.category );
            });
            return collections;
        },
        /**
         * Makes a GeoJSON layer for any kind of element.
         * Processing style, icons, and popup events.
         *
         * @method _make_geojson_layer
         * @param {Array} data
         * @return {Object}
         */
        _make_geojson_layer: function( data )
        {
            var context = this,
                geojson_layer;
            var feature_style = function(feature)
            {
                var color = (feature.properties.stroke && feature.properties.stroke.color) || "#ff7800";
                var width = (feature.properties.stroke && feature.properties.stroke.width) || 5;
                if( typeof color != 'string' ) {
                    color = '#FFFFFF';
                }
                if( color.substr(0,1) != '#' ) {
                    color = '#' + color;
                }
                var style = {
                    "color": color,
                    "weight": width,
                    "opacity": 0.85
                };
                feature._style_original = style
                return style;
            },
            feature_select = function(feature, layer)
            {
                if( typeof layer._icon != strundefined )
                {
                    layer._icon.classList.add('marker-highlight');
                }
                else
                {
                    context.polyline_select( feature, layer );
                }
                callbacks.on_feature_selected(feature, layer);
            },
            feature_unselect = function(feature, layer)
            {
                if( typeof layer._icon != strundefined && layer._icon != null )
                {
                    layer._icon.classList.remove('marker-highlight');
                }
                else
                {
//                    layer.setStyle( feature_style(feature) );
                    context.polyline_unselect( feature, layer );
                }
            };
            geojson_layer = new L.GeoJSON(data, {
                style: feature_style,
                pointToLayer: function(feature, latlng) {
                    var smallIcon = L.Icon.extend({
                        options: {
                            iconUrl: feature.properties.icon_url || fallback_icon,
                            iconAnchor: [12,0]
                        }
                    });
                    var myIcon = new smallIcon();
                    var m = L.marker(latlng, {icon: myIcon});
                    context._layer_bounds[ 0 ].extend( m.getLatLng() );
                    return m;
                },
                onEachFeature: function (feature, layer) {
                    if( feature.geometry.type === 'LineString' ) {
                        ++_poyline_count;
                    } else {
                        ++_point_count;
                    }
                    var popup_content = context._L_popup_open( $('#gooltracking_map_popup'), feature.properties );
                    layer.bindPopup( popup_content,
                                    {
                                        className: 'gooltracking_map_popup',
                                        maxWidth: '250'
                                    } );
                    layer.on(
                        {
                            click: function( e )
                            {
                                if( context.selected.length )
                                {
                                    feature_unselect( context.selected[0], context.selected[1] );
                                }
                                feature_select( feature, layer );
                                context.selected[0] = feature;
                                context.selected[1] = layer;

                                callbacks.on_popup_open( $('.gooltracking_map_popup').find(".leaflet-popup-content"), feature.properties );
                            }
                        }
                    );
                }
            });
            return geojson_layer;
        },
        /**
         * Select a polyline. Changes style and adds markers
         *
         * @method polyline_select
         * @param {Feature} feature
         * @param {Layer} layer
         */
        polyline_select: function(feature, layer)
        {
            var highlightStyle = {
                opacity: 0.7,
                weight: 7
            };
            if( typeof mapPolylinesHighlightColor != strundefined ) {
                highlightStyle.color = mapPolylinesHighlightColor;
            }
            layer.setStyle(highlightStyle);
            this.polyline_set_markers(feature);
        },
        /**
         * Adds to the map the start and end markers for a polyline
         *
         * @method polyline_set_markers
         * @param {Feature} feature
         */
        polyline_set_markers: function(feature)
        {
            if( typeof feature._marker_start == strundefined ) {
                var polylineIcon = L.Icon.extend({
                    options: {
                        iconUrl: gooltracking.utils.url.base_url('assets/images/marker_start.png'),
                        iconSize:     [22, 22], // size of the icon
                        iconAnchor:   [11, 11] // point of the icon which will correspond to marker's location
                    }
                });
                var latlng_start = feature.geometry.coordinates[0];
                feature._marker_start = L.marker([ latlng_start[1], latlng_start[0] ], {
                    icon: new polylineIcon(),
                    zIndexOffset: 1000
                });

                var latlng_end = feature.geometry.coordinates[ feature.geometry.coordinates.length - 1 ];
                feature._marker_end = L.marker([ latlng_end[1], latlng_end[0] ], {
                    icon: new polylineIcon({
                            iconUrl: gooltracking.utils.url.base_url('assets/images/marker_end.png')
                        }),
                    zIndexOffset: 200
                });
            }

            feature._marker_start.addTo(this._map);
            feature._marker_end.addTo(this._map);
        },
        /**
         * Unselect a polyline. Restores style and removes markers
         *
         * @method polyline_select
         * @param {Feature} feature
         * @param {Layer} layer
         */
        polyline_unselect: function(feature, layer)
        {
            layer.setStyle( feature._style_original );
            this.polyline_unset_markers(feature);
        },
        /**
         * Removes from the map the start and end markers for a polyline
         *
         * @method polyline_unset_markers
         * @param {Feature} feature
         */
        polyline_unset_markers: function(feature)
        {
            this._map.removeLayer( feature._marker_start );
            this._map.removeLayer( feature._marker_end );
        },
        /**
         * Given a GeoJSON string, it returns the list of features.
         *
         * @method geojson_read_features
         * @param {String} geojson
         * @return array
         */
        geojson_read_features: function( geojson )
        {
            return geojson.features;
        },
        /**
         * Takes as input the list of features fetched using this.geojson_read_features
         * and divides the list in points and routes.
         *
         * @method geojson_divide_features
         * @param {Object} features
         * @return {Object}
         */
        geojson_divide_features: function( features )
        {
            var points = [], routes = [];
            for( var a in features )
            {
                if( features[a].geometry.type == 'LineString' )
                {
                    routes.push( features[a] );
                }
                else // TODO: check for point geometry type
                {
                    points.push( features[a] );
                }
            }
            return { points: points, routes: routes };
        },
        /**
         * Calls current map fitBounds function
         *
         * @method focus_bounds
         * @param {L.Bounds} bounds
         * @param {Array}    padding ex: [50,50]
         */
        focus_bounds: function( bounds, padding )
        {
            this._map.fitBounds( bounds, {padding: padding} );
        },
        /**
         * Focus the map to a layer, meaning to fit its extent.
         * Max zoom is optional but important.
         *
         * @method focus_layer_on_position
         * @param {Integer} pos
         * @param {Integer} max_zoom
         */
        focus_layer_on_position: function( pos, max_zoom )
        {
            // If we get only one element, the extent can be a point,
            // so we see max zoom in the map, which is
            // completely useless.
            var max_zoom = max_zoom | 14;
            var bounds;

            switch( pos )
            {
                case 0:
                    bounds = this._layer_bounds[ pos ];
                    if( bounds.getNorthEast() )
                    {
                        break;
                    }
                case 1:
                    var layers = this._map._layers;
                    for( var a in layers )
                    {
                        if( typeof layers[a].getBounds != 'function'
                            || !(layers[a].feature && layers[a].feature.geometry.type == 'LineString') )
                        {
                            continue;
                        }
                        if( bounds )
                        {
                            bounds.extend( layers[a].getBounds() );
                        }
                        else
                        {
                            bounds = layers[a].getBounds();
                        }
                    }
                    break;
            }

            if( bounds && bounds.getNorthEast() )
            {
                this._map.fitBounds(bounds);
                if( this._map.getZoom() > max_zoom )
                {
                    this._map.setZoom(max_zoom);
                }
            }
        },
        /**
        * Focus the map on the given latlng
        *
        * @method focus_latlng
        * @param {String} element (point|route)
        * @param {Integer} pos
        * @param {Integer} zoom
        */
        focus_latlng: function( latlng, zoom )
        {
            this._map.setView( latlng, zoom );
        },
        /**
        * Focus the map in the given feature's latlng
        *
        * @method focus_feature
        * @param {String}  feature_geometry_type (point|route)
        * @param {Integer} feature_id
        */
        focus_feature: function( feature_geometry_type, feature_id )
        {
            var l = this.find_feature_layer( feature_geometry_type, feature_id );
            if( l )
            {
                this.focus_latlng( l.getLatLng(), 14 );
            }
        },
        /**
        * Finds a feature layer in all layers of the map
        *
        * WARNING: It doesn't work when clustering is activated.
        *
        * @method find_feature_layer
        * @param {String}  feature_geometry_type (point|route)
        * @param {Integer} feature_id
        */
        find_feature_layer: function( feature_geometry_type, feature_id )
        {
            var feature_layers = [];
            for(var a in this._map._layers)
            {
                var l = this._map._layers[ a ];
                console.log(l);
                if( typeof l._featureGroup != strundefined )
                {
                    feature_layers.concat( l._featureGroup._layers );
                }
                else if( l.feature )
                {
                    feature_layers.push( l );
                }
            }
            for( var c in feature_layers )
            {
                var f = feature_layers[ c ].feature;
                if( f.geometry.type == feature_geometry_type && f.properties.id == feature_id )
                {
                    console.log( "found: " + f.properties.id );
                    return feature_layers[ c ];
                }
            }
            console.log("not found");
            return false;
        },
        /**
        * Returns the properties of a feature
        *
        * @method _L_get_feature_properties
        * @param {ol.Feature} feature
        */
        _L_get_feature_properties: function( feature )
        {
            return feature.getProperties();
        },
        /**
        * Will open a popup and set data on it from the information contained
        * in the feature parameter.
        *
        * @method _L_open_popup
        * @param {jQuery} element
        * @param {Object} props
        */
        _L_popup_open: function( element, props )
        {
            this._L_popup_set_data( element, props );
            return $(element).html();
        },
        /**
        * Sets title, link, thumbnail src and attachment
        * icons into a popup.
        *
        * @method _L_popup_set_data
        * @param {jQuery} _element
        * @param {Object} props
        */
        _L_popup_set_data: function( _element, props )
        {
            _element.find('h4').html(props.title);
            var link_attr = {
                href: props.permalink,
                title: props.title
            };
            // If the link is not to the same list-viewer, then
            // we add a target='_blank' attribute.
            if( props.permalink.indexOf( gooltracking.utils.url.base_url('') ) == -1 )
            {
                link_attr.target = '_blank';
            }
            _element.find('a').attr( link_attr );
            if( typeof props.image_url == strundefined || props.image_url == '' )
            {
//                _element.find('img').hide();
                _element.find('img').attr({ src: fallback_image }).show();
            }
            else
            {
                _element.find('img').attr({ src: props.image_url }).show();
            }
            var icons = _element.find('.icons');
            icons.find('.glyphicon').hide();
            if( typeof props.attachments != strundefined )
            {
                for( var a in props.attachments )
                {
                    var glyphicon = false;
                    switch( a )
                    {
                        case 'document':
                            glyphicon = '.glyphicon-file';
                            break;
                        case 'link':
                            glyphicon = '.glyphicon-link';
                            break;
                        case 'video':
                            glyphicon = '.glyphicon-film';
                            break;
                        case 'image':
                            glyphicon = '.glyphicon-camera';
                            break;
                    }
                    if( glyphicon )
                    {
                        // .show() is sometimes annoying
                        icons.find( glyphicon ).css('display', 'inline-block');
                    }
                }
            }
        },
        /**
        * Sets a callback for an event
        *
        * Currently suppoted:
        *  - on_feature_selected
        *  - on_popup_open
        *
        * @method register_callback
        * @param {jQuery} _element
        * @param {Object} props
        */
        register_callback: function( name, method )
        {
            callbacks[ name ] = method;
        },
        /**
        * Adds the base controls to the map
        *
        * @method set_logo
        */
        set_base_controls: function() {
            this.set_legend();

            L.control.zoom({
                position:'topleft'
            }).addTo(this._map);

            L.control.fullscreen({
                position: 'topleft', // change the position of the button can be topleft, topright, bottomright or bottomleft, defaut topleft
                content: null, // change the content of the button, can be HTML, default null
                forceSeparateButton: false, // force seperate button to detach from zoom buttons, default false
                forcePseudoFullscreen: false // force use of pseudo full screen even if full screen API is available, default false
            }).addTo(this._map);

//            this._load_indicator = L.control.loadIndicator();
//            this._load_indicator.addTo(this._map);

            this._load_spin = L.control.loadSpin();
            this._load_spin.addTo(this._map);
        },
        /**
        * Adds a gooltracking logo control to the map
        * Used mostly in the embed views.
        *
        * @method set_logo
        */
        set_logo: function() {
            /**
             * Image control dependency
             */
            L.Control.Image = L.Control.extend({
              options: {
                // topright, topleft, bottomleft, bottomright
                position: 'bottomright'
              },
              initialize: function (options) {
                // constructor
                L.Util.setOptions(this, options);
              },
              onAdd: function (map) {
                // happens after added to map
                var container = L.DomUtil.create('div', 'logo-container');
                var link = L.DomUtil.create('a', "", container);
                var image = L.DomUtil.create('img', 'map_gooltracking_logo', link);
                $(link).attr('href', "http://web.gooltracking.com").attr("target", "_blank");
                $(image).attr({ src: gooltracking.utils.url.base_url('assets/images/logo-gooltracking.png') });
                return container;
              },
              onRemove: function (map) {
                // when removed
              }
            });
            var logo = new L.Control.Image();
//            logo.addTo(this._map);
            this._map.addControl(logo);

            if( _controls_bottom_margin < 50 )
            {
                _controls_bottom_margin = 50;
            }
        },
        /**
         * Sets the legend on the map (if any)
         *
         */
        set_legend: function()
        {
            if( $('#gooltracking_map_legend').size() > 0 /*&& _poyline_count > 0*/) {
                var legendControl = L.Control.extend({

                    options: {
                        position: 'topleft'
                        //control position - allowed: 'topleft', 'topright', 'bottomleft', 'bottomright'
                    },

                    onAdd: function (map) {
                        return $('#gooltracking_map_legend')[0];
                    },

                    initialize: function() {
                        $('#gooltracking_map_legend').show();
                    }
                });
                this._map.addControl(new legendControl());
//                legendControl.addTo(this.map._map);
            }
        },
        /**
        * Thre set_logo method requires some margin to avoid bing covered
        * by another control. This method returns the needed margin size.
        *
        * @method set_logo
        */
        get_controls_bottom_margin: function() {
            return _controls_bottom_margin;
        },
        /**
        * Remove all routes and points from the map and clean the
        * arrays in this class.
        *
        * @method clear_all_layers
        */
        clear_all_layers: function() {
            if( this.selected.length > 1 && typeof this.selected[1]._icon != strundefined && this.selected[1]._icon != null )
            {
                this.selected[1]._icon.classList.remove('marker-highlight');
            }
            else if( this.selected.length > 1 )
            {
                this.polyline_unselect( this.selected[0], this.selected[1] );
            }

            for( var a in this._routes_layers ) {
                this._routes_layers[a].clearLayers();
            }
            this._routes_layers = [];

            for( var a in this._cluster_layers ) {
                this._cluster_layers[a].clearLayers();
                this._cluster_layers[a].clearLayers();
            }
            this._cluster_layers = [];
            this._points_layers = [];
        }
    };

    return __package__;
    //END
}
);

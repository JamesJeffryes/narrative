/**
 * Widget to display a table of data objects from a kbase workspace.
 *
 * TODO: Re-enable "readonly" mode by following instructions in isReadonlyWorkspace()
 *       (dan g. 10/30/2014)
 *
 * Options:
 *    wsId - the name of the workspace to show in this widget
 *    loadingImage - an image to show in the middle of the widget while loading data
 *    notLoggedInMsg - a string to put in the middle of the widget when not logged in.
 *
 * Triggers events:
 * dataUpdated.Narrative - when the loaded data table gets updated.
 * workspaceUpdated.Narrative - when the current workspace ID gets updated
 * @author Bill Riehl <wjriehl@lbl.gov>
 * @author Dan Gunter <dkgunter@lbl.gov>
 * @public
 */
(function( $, undefined ) {

    $.KBWidget({
        name: "kbaseNarrativeManagePanel", 
        parent: "kbaseNarrativeControlPanel",
        version: "1.0.0",
        wsClient: null,
        table: null,
        tableData: [],
        $loginMessage: null,
        $errorMessage: null,
        $loading: null,
        isLoggedIn: false,
        narrWs: null, /* see setNarrWS */
        // The set of all data currently loaded into the widget
        loadedData: {},
        options: {
            title: 'Narratives',
            loadingImage: "static/kbase/images/ajax-loader.gif",
            ws_url: "https://kbase.us/services/ws",
            nms_url: "https://kbase.us/services/narrative_method_store/rpc",
            user_name_fetch_url:"https://kbase.us/services/genome_comparison/users?usernames=",
            ws_name: null,
            nar_name: null,
        },
        
        ws:null,
        manager:null,
        
        ws_name: null,
        nar_name: null,
        
        $mainPanel: null,
        $newNarrativeLink: null, // when a new narrative is created, gives a place to link to it
        
        init: function(options) {
            this._super(options);

            if (this.options.ws_name)  { this.ws_name = options.ws_name; }
            if (this.options.nar_name) { this.nar_name = options.nar_name; }

            if (window.kbconfig && window.kbconfig.urls) {
                this.options.ws_url = window.kbconfig.urls.workspace;
                this.options.nms_url = window.kbconfig.urls.narrative_method_store;
            }
            
            this.$mainPanel = $('<div>').css({'height':'600px'});
            this.body().append(this.$mainPanel);
            
            $(document).on(
                'setWorkspaceName.Narrative', $.proxy(function(e, info) {
                    this.ws_name = info.wsId;
                    this.nar_name = info.narrController;
                    this.refresh();
                }, this)
            );
            
            this.landingPageMap = window.kbconfig.landing_page_map;
            
            if (this.ws_name && this.nar_name && this.ws) {
                this.refresh();
            }
            return this;
        },

        loggedInCallback: function(event, auth) {
            this.ws = new Workspace(this.options.ws_url, auth);
            this.manager = new NarrativeManager({ws_url:this.options.ws_url, nms_url:this.options.nms_url},auth);
            this.refresh();
            return this;
        },
        loggedOutCallback: function(event, auth) {
            this.ws = null;
            this.manager=null;
            this.refresh();
            return this;
        },
        
        refresh: function() {
            if (!self.$narPanel) {
                this.renderHeader();
            }
            this.loadDataAndRenderPanel();
        },
        
        
        narData: null,
        allNarInfo:null,
        tempNars:null,
        oldStyleWs:null,
        
        loadDataAndRenderPanel: function() {
            var self = this;
            if (self.ws) {
                self.narData=null;
                self.ws.list_workspace_info(
                    {excludeGlobal:1},
                    function(wsList) {
                        self.narData={
                            mine:[],
                            shared:[],
                            pub:[],
                            temp:[],
                            allWs:[]
                        };
                        self.allNarData=[];
                        /*WORKSPACE INFO
                            0: ws_id id
                            1: ws_name workspace
                            2: username owner
                            3: timestamp moddate,
                            4: int object
                            5: permission user_permission
                            6: permission globalread,
                            7: lock_status lockstat
                            8: usermeta metadata*/
                        var narRefsToLookup = []; var allNarInfo = [];
                        for (var i=0; i<wsList.length; i++) {
                            if (wsList[i][8]) { // must have metadata or else we skip
                                
                                // if it is temporary, we skip
                                if (wsList[i][8].is_temporary) {
                                    if (wsList[i][8].is_temporary === 'true') {
                                        self.narData.temp.push({ws_info:wsList[i]});
                                        continue;
                                    }
                                }
                                //must have the new narrative tag, or else we skip
                                if (wsList[i][8].narrative) {  
                                    var info={
                                            ws_info: wsList[i],
                                            nar_info: null,
                                            $div:null
                                    };
                                    if (wsList[i][2]===self._attributes.auth.user_id) {
                                        self.allNarData.push(info);
                                        self.narData.mine.push(info);
                                        narRefsToLookup.push({ref:info.ws_info[0]+"/"+wsList[i][8].narrative});
                                    } else if (wsList[i][5]==='a' || wsList[i][5]==='w' || wsList[i][5]==='r') {
                                        self.allNarData.push(info);
                                        self.narData.shared.push(info);
                                        narRefsToLookup.push({ref:info.ws_info[0]+"/"+wsList[i][8].narrative});
                                    }
                                }
                                if (wsList[i][5]==='a' || wsList[i][5]==='w') {
                                    // allWs is used for advanced management options, which we only
                                    // have if we have admin or write access
                                    self.narData.allWs.push({ws_info:wsList[i]});
                                }
                            }
                        }
                        self.ws.get_object_info(narRefsToLookup,1,
                                function(objList) {
                                    for(var i=0; i<objList.length; i++) {
                                        self.allNarData[i].nar_info = objList[i];
                                    }
                                    self.renderPanel();
                                },
                                function(error) {
                                    console.error(error);
                                });
                    },
                    function (error) {
                        console.error(error);
                    }
                )
            }
        },
        
        renderHeader: function() {
            var self = this;
            if (self.$mainPanel) {
                self.$mainPanel.empty();
                
                $newNarrativeLink = $("<div>").css({'margin':'10px','text-align':'center'});
                self.$mainPanel.append(
                    $('<div>').css({'margin':'15px','text-align':'center'}).append(
                        self.makeNewNarrativeBtn()).append(
                        $newNarrativeLink));
                
                self.$newNarrativeLink = $('<div>');
                self.$mainPanel.append(self.$newNarrativeLink);
                
                self.$narPanel = $('<div>'); //.css({'margin':'10px'});
                self.$mainPanel.append(self.$narPanel);
                //self.renderPanel();
            }
        },
        
        advancedSetNarLookup: {},
        
        renderPanel: function() {
            var self = this;
            if (self.$narPanel && self.narData) {
                self.$narPanel.empty();
                
                if (self.narData.mine.length>0) {
                    self.$narPanel.append($('<div>').append($('<div>').addClass('kb-nar-manager-titles').append("My Narratives")));
                    self.narData.mine.sort(function(a,b) {
                                    if (a.nar_info[3] > b.nar_info[3]) return -1; // sort by date
                                    if (a.nar_info[3] < b.nar_info[3]) return 1;  // sort by date
                                    return 0;
                                });
                    for(var k=0; k<self.narData.mine.length; k++) {
                        if (!self.narData.mine[k].$div) {
                            self.narData.mine[k].$div = self.renderNarrativeDiv(self.narData.mine[k]);
                        }
                        self.$narPanel.append(self.narData.mine[k].$div);
                    }
                }
                
                if (self.narData.shared.length>0) {
                    self.narData.shared.sort(function(a,b) {
                                    if (a.nar_info[3] > b.nar_info[3]) return -1; // sort by date
                                    if (a.nar_info[3] < b.nar_info[3]) return 1;  // sort by date
                                    return 0;
                                });
                    self.$narPanel.append($('<div>').append($('<div>').addClass('kb-nar-manager-titles').append("Shared With Me")));
                    for(var k=0; k<self.narData.shared.length; k++) {
                        if (!self.narData.shared[k].$div) {
                            self.narData.shared[k].$div = self.renderNarrativeDiv(self.narData.shared[k]);
                        }
                        self.$narPanel.append(self.narData.shared[k].$div);
                    }
                }
                
                
                // ADVANCED TAB: allows users to set the default narrative for any workspace
                var $advancedDiv = $('<div>').hide();
                var $advLink = $('<h4>').append("Show Advanced Controls");
                self.$narPanel.append($('<div>').append($('<span>').append($("<a>").append($advLink)))
                                        .css({'text-align':'center','cursor':'pointer'})
                                        .on('click', function() {
                                            if ($advancedDiv.is(":visible") ) {
                                                $advancedDiv.hide();
                                                $advLink.html("Show Advanced Controls");
                                            } else {
                                                $advancedDiv.show();
                                                $advLink.html("Hide Advanced Controls");
                                            }
                                        }));
                self.$narPanel.append($advancedDiv);
                
                
                var $selectWsContainer = $('<select id="setPrimaryNarSelectWs">').addClass('form-control');
                var $selectNarContainer = $('<select id="setPrimaryNarSelectNar">').addClass('form-control').hide();
                var $setBtn = $('<button>').addClass('btn btn-default').append('Set this Narrative').hide();
                var $setPrimary = $('<div>').append(
                    $('<div>').addClass('form-group').css({'text-align':'center'})
                        .append($('<label for="setPrimaryNarSelectWs">').append("Set Active Narrative for Workspace"))
                        .append($selectWsContainer)
                        .append($selectNarContainer)
                        .append($setBtn));
                
                self.narData.allWs.sort(function(a,b) {
                    if (a.ws_info[1].toLowerCase() > b.ws_info[1].toLowerCase()) return 1; // sort by name
                    if (a.ws_info[1].toLowerCase() < b.ws_info[1].toLowerCase()) return -1;  // sort by name
                    return 0;
                });
                
                for(var k=0; k<self.narData.allWs.length; k++) {
                    var info = self.narData.allWs[k].ws_info;
                    $selectWsContainer.append($('<option value="'+info[1]+'">').append(info[1] + ' (id='+info[0]+')'));
                }
                $selectWsContainer.on('change',
                    function() {
                        $selectNarContainer.empty();
                        self.ws.list_objects({
                                workspaces: [$selectWsContainer.val()],
                                type:"KBaseNarrative.Narrative",
                                includeMetadata:1
                            },
                            function(objList) {
                                if (objList.length==0) {
                                    $selectNarContainer.append($('<option value="none">').append('No Narratives'));
                                    $setBtn.prop('disabled', true);
                                    $selectNarContainer.prop('disabled', true);
                                    return;
                                }
                                $setBtn.prop('disabled', false);
                                $selectNarContainer.prop('disabled', false);
                                
                                // sort by date
                                objList.sort(function(a,b) {
                                    if (a[3] > b[3]) return -1; // sort by date
                                    if (a[3] < b[3]) return 1;  // sort by date
                                    return 0;
                                });
                                self.advancedSetNarLookup = {};
                                // add the list to the select
                                for(var i=0; i<objList.length; i++) {
                                    var narDispName = objList[i][1];
                                    if (objList[i][10].name) {
                                        narDispName = objList[i][10].name;
                                    }
                                    self.advancedSetNarLookup[objList[i][0]] = narDispName;
                                    $selectNarContainer.append($('<option value="'+objList[i][0]+'">')
                                                                .append(narDispName + ' (id='+objList[i][0]+')'));
                                }
                            },
                            function(error) {
                                console.error(error);
                            });
                        
                        $selectNarContainer.show();
                        $setBtn.show();
                    });
                $selectWsContainer.change();
                $setBtn.on('click',
                    function() {
                        // should only get here if it was a valid WS/Nar combo
                        var ws = $selectWsContainer.val();
                        var nar = $selectNarContainer.val();
                        $(this).prop('disabled', true).empty().append("please wait...");
                        // should probably be moved to NarrativeManager
                        self.ws.alter_workspace_metadata({
                                wsi:{workspace:ws},
                                new: {
                                    'narrative' : nar,
                                    'is_temporary' : 'false',
                                    'narrative_nice_name': self.advancedSetNarLookup[nar]
                                }
                            },
                            function (args) {
                                self.loadDataAndRenderPanel();  
                            },
                            function name(error) {
                                $setBtn.html("error...");
                                console.error(error);
                            }
                        );
                    });
                $advancedDiv.append($setPrimary);
            }
        },
        
        addDataControls: function(object_info, $alertContainer) {
            var self = this;
            var $btnToolbar = $('<span>')
                                        .addClass('btn-toolbar')
                                        .attr('role', 'toolbar');
            
            var btnClasses = "btn btn-xs btn-default";
            var css = {'color':'#888'};
                                        
            var $openHistory = $('<span>')
                                        .addClass(btnClasses).css(css)
                                        .tooltip({title:'View narrative history to revert changes', 'container':'body'})
                                        .append($('<span>').addClass('fa fa-history').css(css))
                                        .click(function(e) {
                                            e.stopPropagation(); $alertContainer.empty(); $alertContainer.show();
                                            
                                            if (self.ws_name && self.ws) {
                                                self.ws.get_object_history({ref:object_info[6]+"/"+object_info[0]},
                                                    function(history) {
                                                        console.log(history);
                                                        history.reverse();
                                                        $alertContainer.append($('<div>')
                                                            .append($('<button>').addClass('kb-data-list-cancel-btn')
                                                                        .append('Hide History')
                                                                        .click(function() {$alertContainer.empty();} )));
                                                        var $tbl = $('<table>').css({'width':'100%'});
                                                        for(var k=0; k<history.length;k++) {
                                                            var $revertBtn = $('<button>').append('v'+history[k][4]).addClass('kb-data-list-btn');
                                                            if (k==0) {
                                                                $revertBtn.tooltip({title:'Current Version', 'container':'body',placement:'bottom'});
                                                            } else if(history[k][4]==1) {
                                                                $revertBtn.tooltip({title:'Cannot revert to first unsaved version', 'container':'body',placement:'bottom'});
                                                            } else {
                                                                var revertRef = {wsid:history[k][6], objid:history[k][0], ver:history[k][4]};
                                                                (function(revertRefLocal) {
                                                                    $revertBtn.tooltip({title:'Revert to this version?', 'container':'body',placement:'bottom'})
                                                                        .click(function() {
                                                                            self.ws.revert_object(revertRefLocal,
                                                                                function(reverted_obj_info) {
                                                                                    self.refresh();
                                                                                }, function(error) {
                                                                                    console.error(error);
                                                                                    $alertContainer.empty();
                                                                                    $alertContainer.append($('<span>').css({'color':'#F44336'}).append("Error! "+error.error.message));
                                                                                });
                                                                        }); })(revertRef);
                                                            }
                                                            
                                                            var summary = '';
                                                            console.log(history[k][4],history[k][10])
                                                            if (history[k][10].methods) {
                                                                var content = JSON.parse(history[k][10].methods);
                                                                var summaryCounts = [];
                                                                var appCount=0; var methodCount=0;
                                                                for(var a in content.app) {
                                                                    if (content.app.hasOwnProperty(a)) {
                                                                        appCount+= content.app[a];
                                                                    }
                                                                }
                                                                if (appCount===1) { summaryCounts.push('1 App'); }
                                                                else if (appCount>1) { summaryCounts.push(appCount+' Apps');}
                                                                
                                                                for(var m in content.method) {
                                                                    if (content.method.hasOwnProperty(m)) {
                                                                        methodCount+= content.method[m];
                                                                    }
                                                                }
                                                                if (methodCount===1) { summaryCounts.push('1 Method'); }
                                                                else if (methodCount>1) { summaryCounts.push(methodCount+' Methods');}
                                                                
                                                                if (content.ipython.code ===1) { summaryCounts.push('1 Code Cell'); }
                                                                else if (content.ipython.code >1) { summaryCounts.push(content.ipython.code + ' Code Cells'); }
                                                                
                                                                if (content.ipython.markdown ===1) { summaryCounts.push('1 Markdown Cell'); }
                                                                else if (content.ipython.markdown >1) { summaryCounts.push(content.ipython.markdown + ' Markdown Cells'); }
                                                                
                                                                if (content.output ===1) { summaryCounts.push('1 Output Cell'); }
                                                                else if (content.output >1) { summaryCounts.push(content.output + ' Output Cells'); }
                                                                
                                                                if (summaryCounts.length>0) {
                                                                    summary = '<br>'+summaryCounts.join(', ');
                                                                } else {
                                                                    summary = '<br>Empty Narrative';
                                                                }
                                                            }
                                                            $tbl.append($('<tr>')
                                                                        .append($('<td>').append($revertBtn))
                                                                        .append($('<td>').append(self.getTimeStampStr(history[k][3]) + ' by ' + history[k][5] + summary))
                                                                        .append($('<td>').append($('<span>').css({margin:'4px'}).addClass('fa fa-info pull-right'))
                                                                                 .tooltip({title:history[k][2]+'<br>'+history[k][8]+'<br>'+history[k][9]+' bytes', container:'body',html:true,placement:'bottom'}))
                                                                                );
                                                        }
                                                        $alertContainer.append($tbl);
                                                    },
                                                    function(error) {
                                                        console.error(error);
                                                        $alertContainer.empty();
                                                        $alertContainer.append($('<span>').css({'color':'#F44336'}).append("Error! "+error.error.message));
                                                    });
                                            }
                                        });
                                        
            /*var $openProvenance = $('<span>')
                                        .addClass(btnClasses).css(css)
                                        .tooltip({title:'View data provenance and relationships', 'container':'body'})
                                        .append($('<span>').addClass('fa fa-sitemap fa-rotate-90').css(css))
                                        .click(function(e) {
                                            e.stopPropagation(); $alertContainer.empty();
                                            window.open(self.options.landing_page_url+'objgraphview/'+object_info[7]+'/'+object_info[1]);
                                        });*/
            /*var $download = $('<span>')
                                        .addClass(btnClasses).css(css)
                                        .tooltip({title:'Export / Download data', 'container':'body'})
                                        .append($('<span>').addClass('fa fa-download').css(css))
                                        .click(function(e) {
                                            e.stopPropagation(); $alertContainer.empty();
                                            $alertContainer.append('Coming soon');
                                        });*/
            
            var $copy = $('<span>')
                                        .addClass(btnClasses).css(css)
                                        .tooltip({title:'Copy Narrative and Data', 'container':'body'})
                                        .append($('<span>').addClass('fa fa-copy').css(css))
                                        .click(function(e) {
                                            e.stopPropagation(); $alertContainer.empty(); $alertContainer.show();
                                            var $newNameInput = $('<input type="text">').addClass('form-control').val(object_info[1]);
                                            $alertContainer.append($('<div>')
                                                .append($('<div>').append("Enter a name for the new Narrative"))
                                                .append($('<div>').append($newNameInput))
                                                .append($('<button>').addClass('kb-data-list-btn')
                                                            .append('Copy')
                                                            .click(function() {
                                                                $(this).disable().prop('disabled', true);;
                                                                if (self.ws_name && self.ws) {
                                                                    self.ws.clone_workspace({
                                                                            obj: {ref:object_info[6]+"/"+object_info[0]},
                                                                            new_name: $newNameInput.val()
                                                                        },
                                                                        function(renamed_info) {
                                                                            self.refresh();
                                                                        },
                                                                        function(error) {
                                                                            console.error(error);
                                                                            $alertContainer.empty();
                                                                            $alertContainer.append($('<span>').css({'color':'#F44336'}).append("Error! "+error.error.message));
                                                                        });
                                                                }
                                                            }))
                                                .append($('<button>').addClass('kb-data-list-cancel-btn')
                                                            .append('Cancel')
                                                            .click(function() {$alertContainer.empty();} )));
                                        });
            var $delete = $('<span>')   
                                        .addClass(btnClasses).css(css)
                                        .tooltip({title:'Delete Narrative', 'container':'body'})
                                        .append($('<span>').addClass('fa fa-trash-o').css(css))
                                        .click(function(e) {
                                            e.stopPropagation();
                                            $alertContainer.empty(); $alertContainer.show();
                                            $alertContainer.append($('<div>')
                                                .append($('<span>').append('Are you sure?'))
                                                .append($('<button>').addClass('kb-data-list-btn')
                                                            .append('Delete')
                                                            .click(function() {
                                                                if (self.ws_name && self.ws) {
                                                                    self.ws.delete_workspace({ id: object_info[6] },
                                                                        function() {
                                                                            self.refresh();
                                                                        },
                                                                        function(error) {
                                                                            console.error(error);
                                                                            $alertContainer.empty();
                                                                            $alertContainer.append($('<span>').css({'color':'#F44336'}).append("Error! "+error.error.message));
                                                                        });
                                                                }
                                                            }))
                                                .append($('<button>').addClass('kb-data-list-cancel-btn')
                                                            .append('Cancel')
                                                            .click(function() {$alertContainer.empty();} )));
                                        });
            
            $btnToolbar
                .append($openHistory)
                //.append($openProvenance)
                //.append($download)
                //.append($copy)
                .append($delete);
            
            return $btnToolbar;
        },
        
        
        renderNarrativeDiv: function(data) {
            var $narDiv = $('<div>').addClass('kb-data-list-obj-row');
            
            var $tbl = $('<table>').css({'width':'100%'});
            var $dataCol = $('<td>').css({'text-align':'left'});
            var $ctrCol = $('<td>').css({'text-align':'right','vertical-align':'top', 'width':'140px'});
            
            var narRef = "ws."+data.ws_info[0]+".obj."+data.nar_info[0];
            var nameText = narRef;
            if (data.nar_info[10].name) {
                nameText = data.nar_info[10].name;
            }
            var $priv = $('<span>').css({'color':'#999','margin-left':'8px'}).prop('data-toggle','tooltip').prop('data-placement','right');
             if (data.ws_info[5]==='r') {
                $priv.addClass('fa fa-lock').prop('title','read-only');
            } else if (data.ws_info[5]==='w' || data.ws_info[5]==='a') {
                $priv.addClass('fa fa-pencil').prop('title','you can edit');
            }
            
            $dataCol.append(
                $('<div>').addClass('kb-data-list-name').css({'white-space':'normal', 'cursor':'pointer'})
                    .append($('<a href="'+narRef+'" target="_blank">').append(nameText).append($priv)));
            var $usrNameSpan = $('<span>').addClass('kb-data-list-type').append(data.ws_info[2]);
            if(data.ws_info[2]===this._attributes.auth.user_id) {
            } else {
                $dataCol.append($usrNameSpan).append('<br>');
                this.displayRealName(data.ws_info[2], $usrNameSpan);
            }
            $dataCol.append($('<span>').addClass('kb-data-list-type').append(this.getTimeStampStr(data.nar_info[3])));
            
            var self = this;
            var $alertContainer=$('<div>').addClass('kb-data-list-more-div').css({'text-align':'center','margin':'10px'});
            var $btnToolbar = self.addDataControls(data.nar_info,$alertContainer);
            $ctrCol.append($btnToolbar);
            var $shareContainer = $('<div>').hide();
            this.ws.get_permissions({id:data.ws_info[0]},
                function(perm) {
                    var shareCount = 0;
                    for(var usr in perm) {
                        if (perm.hasOwnProperty(usr)) {
                            if (usr === '*') { continue; }
                            shareCount++;
                        }
                    }
                    // should really put this in the addDatacontrols; so refactor at some point!
                    $btnToolbar.append(
                        $('<span>')   
                            .addClass('btn btn-xs btn-default').css({'color':'#888'})
                            .tooltip({title:'View share settings', 'container':'body'})
                                        .append($('<span>').addClass('fa fa-share-alt').css({'color':'#888'})
                                            .append(' '+shareCount)
                                            .on('click',function() {
                                                $alertContainer.hide();
                                                $shareContainer.slideToggle('fast');
                                                if($shareContainer.is(':empty')) {
                                                    var $share = $('<div>');
                                                    // just use the share panel, max height is practically unlimited because we are already
                                                    // in a scrollable pane
                                                    $share.kbaseNarrativeSharePanel({ws_name_or_id:data.ws_info[0],max_list_height:'none', add_user_input_width:'280px'});
                                                    $shareContainer.append($share);
                                                }
                                            })));
                },
                function(error) {
                    console.error('error getting permissions for manage panel');
                    console.error(error);
                });
            
            
            
            $narDiv.append($('<table>').css({'width':'100%'})
                           .append($('<tr>').append($dataCol).append($ctrCol)));
            $narDiv.append($alertContainer);
            $narDiv.append($shareContainer);
            
            var $narDivContainer = $('<div>').append($('<hr>').addClass('kb-data-list-row-hr'))
                                        .append($narDiv);
            
            return $narDivContainer;
        },
        
        
        makeNewNarrativeBtn: function() {
            var self = this;
            var $active = $('<span>').addClass('fa fa-plus').append(" New Narrative");
            var $working = $('<span>').append("Building Narrative...");
            var $btn =
                $('<button>').addClass('btn btn-default').append($active)
                    .on('click', function() {
                        $(this).prop('disabled', true).empty().append($working);
                        var button = this;
                        self.manager.createTempNarrative(
                            {
                                cells:[],
                                parameters:[],
                                importData : []
                            },
                            function(info) {
                                // info.ws_info   info.nar_info
                                console.log('created new narrative!');
                                console.log(info);
                                var newWsId = info.nar_info[6];
                                var newNarId = info.nar_info[0];
                                $newNarrativeLink.empty().append('<a href="ws.'+newWsId+'.obj.'+newNarId+'" target="_blank">Open your new Narrative.</a>');
                                $(button).prop('disabled', false).empty().append("Narrative Created");
                            },
                            function(error) {
                                alert('error!!'+error.error.message);
                                console.error('error');
                                $(button).prop('disabled', false).empty().append("Narrative Creation Error");
                            }
                        )
                    });
            
            return $btn;
        },
        
        
        // edited from: http://stackoverflow.com/questions/3177836/how-to-format-time-since-xxx-e-g-4-minutes-ago-similar-to-stack-exchange-site
        getTimeStampStr: function (objInfoTimeStamp) {
            var date = new Date(objInfoTimeStamp);
            var seconds = Math.floor((new Date() - date) / 1000);
            
            // f-ing safari, need to add extra ':' delimiter to parse the timestamp
            if (isNaN(seconds)) {
                var tokens = objInfoTimeStamp.split('+');  // this is just the date without the GMT offset
                var newTimestamp = tokens[0] + '+'+tokens[0].substr(0,2) + ":" + tokens[1].substr(2,2);
                date = new Date(newTimestamp);
                seconds = Math.floor((new Date() - date) / 1000);
                if (isNaN(seconds)) {
                    // just in case that didn't work either, then parse without the timezone offset, but
                    // then just show the day and forget the fancy stuff...
                    date = new Date(tokens[0]);
                    return this.monthLookup[date.getMonth()]+" "+date.getDate()+", "+date.getFullYear();
                }
            }
            
            // keep it simple, just give a date
            return this.monthLookup[date.getMonth()]+" "+date.getDate()+", "+date.getFullYear();
        },
        
        monthLookup : ["Jan", "Feb", "Mar","Apr", "May", "Jun", "Jul", "Aug", "Sep","Oct", "Nov", "Dec"],
        
        /* we really need to stop all this copy pasting */
        real_name_lookup: {},
        displayRealName: function(username,$targetSpan) {
	    var self = this;
	    if (self.ws) { // make sure we are logged in and have some things
		
                if (self.real_name_lookup[username] && self.real_name_lookup[username] !=="...") {
                    $targetSpan.html(self.real_name_lookup[username]+" ("+username+")");
                } else {
                    self.real_name_lookup[username] = "..."; // set a temporary value so we don't search again
                    $targetSpan.html(username);
                    $.ajax({
                            type: "GET",
                            url: self.options.user_name_fetch_url + username + "&token="+self._attributes.auth.token,
                            dataType:"json",
                            crossDomain : true,
                            success: function(data,res,jqXHR) {
                                if (username in data['data'] && data['data'][username]['fullName']) {
                                    self.real_name_lookup[username] = data['data'][username]['fullName'];
                                    $targetSpan.html(self.real_name_lookup[username]+" ("+username+")");
                                }
                            },
                            error: function(jqXHR, textStatus, errorThrown) {
                                //do nothing
                            }
                        });
                }
	    }
        }
        
    });

})( jQuery );

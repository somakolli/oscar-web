define(["jquery", "tools", "state", "spinner", "oscar"], function ($, tools, state, spinner, oscar) {
	var regionChildrenExpander = oscar.IndexedDataStore();
	
	regionChildrenExpander.m_cfg = {
		preloadShapes : true,
	},
	
	//childrenInfo is:
	//{ <childId> : { apxitems: <int>, name: name, bbox: bbox, clusterHint: hint}
	regionChildrenExpander.m_data = {
		insert: function(parentId, childrenInfo) {
			for(var childId in childrenInfo) {
				if (state.dag.hasRegion(childId)) {
					continue;
				}
				var ci = childrenInfo[childId];
				var parentNode = state.dag.region(parentId);
				var childNode = state.dag.addNode(childId, dag.NodeTypes.Region);
				childNode.count = ci["apxitems"];
				childNode.name = ci["name"];
				childNode.bbox = ci["bbox"];
				childNode.clusterHint = ci["clusterHint"];
				state.dag.addEdge(parentNode, childNode);
			}
		},
		size: function() {
			return state.dag.regionSize();
		},
		count: function(id) {
			if (!state.dag.hasRegion(id)) {
				return false;
			}
			var node = state.dag.region(id);
			return node.isLeaf || node.children.size();
		},
		at: function(id) {
			console.assert(false, "Should never be called");
			return;
		}
	};
	//fetching stuff from store is not necessary,
	//we only call the cb to tell that we're done
	regionChildrenExpander._requestFromStore = function(cb, parentIds) {
		cb();
	};
	regionChildrenExpander._getData = function(cb, remoteRequestId) {
		var parentIds = handler._remoteRequestDataIds(remoteRequestId);
		// is of the form regionId -> { childId -> {apxitems : <int>, name: <string>, bbox: <bbox>, clusterHint: <hint>} }
		var result = {};
		var allChildIds = tools.SimpleSet();
		var resultSize = 0;
		
		var myCBCount = 0;
		var myCB = function() {
			myCBCount += 1;
			if (myCBCount == 2) {
				cb(result, remoteRequestId);
			}
		};

		var myFinish = function() {
			var allChildIds = allChildIds.toArray();
			//cache the shapes
			if (this.m_cfg.preloadShapes) {
				oscar.fetchShapes(allChildIds, function() {});
			}
			
			//now get the item info for the name and the bbox
			oscar.getItems(allChildIds,
				function (items) {
					console.assert(items.length == allChildIds.length);
					var tmp = {};
					for (var i in items) {
						var item = items[i];
						tmp[item.id()] = { name: item.name(), bbox: item.bbox()};
					}
					for(var regionId in result) {
						var ri = result[regionId];
						for(var childId in ri) {
							var ci = ri[childId];
							ci["name"] = tmp[childId]["name"];
							ci["bbox"] = tmp[childId]["bbox"];
						}
					}
					myCB();
				}
			);
			
			state.cqr.clusterHints(allChildIds, function(hints) {
				for(var regionId in result) {
					var ri = result[regionId];
					for(var childId in ri) {
						var ci = ri[childId];
						ci["clusterHint"] = hints[childId];
					}
				}
				myCB();
			}, tools.defErrorCB);
		};
		
		var myWrapper = function(parentId) {
			state.cqr.regionChildrenInfo(parentId, function(childrenInfo) {
				var tmp = {};
				for(var i in childrenInfo) {
					var childId = childrenInfo[i]["id"];
					tmp[childId] = { "apxitems": childrenInfo[i]["apxitems"] }
					allChildIds.insert(childId);
				}
				resultSize += 1;
				result[parentId] = tmp;
				if (resultSize == parentIds.length) {
					myFinish();
				}
			}, tools.defErrorCB);
		};
		
		for(var i in parentIds) {
			myWrapper(parentIds[i]);
		}
	};
	
	var regionCellExpander = oscar.IndexedDataStore();
	//cellInfo is { cellId: bbox }
	regionCellExpander.m_data = {
		insert: function(parentId, cellInfo) {
			for(var cellId in cellInfo) {
				var parentNode = state.dag.region(parentId);
				var childNode;
				if (state.dag.hasCell(cellId)) {
					childNode = state.dag.cell(cellId);
				}
				else {
					childNode = state.dag.addNode(cellId, dag.NodeTypes.Cell);
					childNode.bbox = cellInfo[cellId];
				}
				state.dag.addEdge(parentNode, childNode);
			}
		},
		size: function() {
			return state.dag.regionSize();
		},
		count: function(id) {
			if (!state.dag.hasRegion(id)) {
				return false;
			}
			var node = state.dag.region(id);
			return node.cells.size() || !node.mayHaveItems;
		},
		at: function(id) {
			console.assert(false, "Should never be called");
			return;
		}
	};
	//fetching stuff from store is not necessary,
	//we only call the cb to tell that we're done
	regionCellExpander._requestFromStore = function(cb, parentIds) {
		cb();
	};
	regionCellExpander._getData = function(cb, remoteRequestId) {
		var parentIds = handler._remoteRequestDataIds(remoteRequestId);
		var result = {}; // parentId -> { cellId: bbox }
		var resultSize = 0;
		
		var myFinish = function() {
			
			var missingCellInfo = tools.SimpleSet();
			
			//the cells nodes are now in the dag
			//let's get the bbox of cells that don't have one
			var cellIds = [];
			for(var regionId in result) {
				var ri = result[regionId];
				for(var cellId in ri) {
					if (!state.dag.hasCell(cellId)) {
						missingCellInfo.insert(cellId);
					}
				}
			}
			var missingCellInfo = missingCellInfo.toArray();
			//cellInfo is of the form [[bounds]]
			oscar.getCellInfo(missingCellInfo, function(cellInfo) {
				var tmp = {};
				for(var i in missingCellInfo) {
					tmp[missingCellInfo[i]] = cellInfo[i];
				}
				
				for(var regionId in result) {
					var ri = result[regionId];
					for(var cellId in ri) {
						ri[cellId] = tmp[cellId]; //automatically sets existing cells to undefined
					}
				}
				
				cb(result, remoteRequestId);
			}, tools.defErrorCB);
		};
		
		var myWrapper = function(parentId) {
			state.cqr.getCells(parentId, function(cellInfo) {
				var tmp = {};
				for(var i in cellInfo) {
					tmp[cellInfo[i]] = undefined;
				}
				resultSize += 1;
				result[parentId] = tmp;
				if (resultSize == parentIds.length) {
					myFinish();
				}
			}, tools.defErrorCB);
		};
		
		for(var i in parentIds) {
			myWrapper(parentIds[i]);
		}
	};
	
	var cellItemExpander = oscar.IndexedDataStore();
	
	cellItemExpander.m_cfg = {
		maxFetchCount: 100
	};
	//itemInfo is a simple array {itemId: {name: <string>, bbox: <bbox>}}
	cellItemExpander.m_data = {
		insert: function(cellId, itemInfo) {
			for(var itemId in itemInfo) {
				var cellNode = state.dag.cell(cellId);
				var childNode;
				if (state.dag.hasItem(itemId)) {
					childNode = state.dag.item(itemId);
				}
				else {
					childNode = state.dag.addNode(itemInfo[i], dag.NodeTypes.Item);
					childNode.name = itemInfo["name"];
					childNode.bbox = itemInfo["bbox"];
				}
				state.dag.addEdge(cellNode, childNode);
			}
		},
		size: function() {
			return state.dag.cellSize();
		},
		count: function(id) {
			if (!state.dag.hasCell(id)) {
				return false;
			}
			var node = state.dag.cell(id);
			return node.items.size() || !node.mayHaveItems;
		},
		at: function(id) {
			console.assert(false, "Should never be called");
			return;
		}
	};
	//fetching stuff from store is not necessary,
	//we only call the cb to tell that we're done
	cellItemExpander._requestFromStore = function(cb, cellIds) {
		cb();
	};
	cellItemExpander._getData = function(cb, remoteRequestId) {
		var cellIds = handler._remoteRequestDataIds(remoteRequestId);
		
		//cellItems is { cellId: {itemId: {name:<string>, bbox: <bbox>}}}
		var cellItems = {};
		
		var myFinish = function() {
		
			var missingItemInfo = tools.SimpleSet();
			for(var cellId in cellItems) {
				var ci = cellItems[cellId];
				for(var itemId in ci) {
					if (!state.dag.hasItem(itemId) ) {
						missingItemInfoinsert(itemId);
					}
				}
			}
			oscar.getItems(missingItemInfo.asArray(), function(items) {
				var tmp = {};
				for(var i in items) {
					var item = items[i];
					tmp[item.id()] = item;
				}
				for(var cellId in cellItems) {
					var ci = cellItems[cellId];
					for(var itemId in ci) {
						if (!state.dag.hasItem(itemId)) {
							var item = tmp[itemId];
							ci[itemId] = {
								name: item.name(),
								bbox: item.bbox()
							};
						}
					}
				}
				cb();
			}, tools.defErrorCB);
			cb(cellItems, remoteRequestId);
		};
		
		state.cqr.getCellItems(cellIds, function(info) {
			for(var cellId in info) {
				var ci = info[cellId];
				var tci = cellItems[cellId] = {};
				for(var i in ci) {
					var itemId = [ci];
					tci[itemId] = undefined;
				}
			}
			myFinish();
		}, tools.defErrorCB);
	};

	var dagExpander = function() {
		return {
			regionChildrenExpander: regionChildrenExpander,
			regionCellExpander: regionCellExpander,
			cellItemExpander: cellItemExpander,
	   
			preloadShapes: function()  {
				return this.regionChildrenExpander.m_cfg.preloadShapes ;
			},
	   
			setPreloadShapes: function(value) {
				this.regionChildrenExpander.m_cfg.preloadShapes = value;
			},
	   
			bulkItemFetchCount: function() {
				return this.cellItemExpander.m_cfg.bulkItemFetchCount 
			},
	   
			setBulkItemFetchCount: function(value) {
				this.cellItemExpander.m_cfg.bulkItemFetchCount = value;
			},
	   
			loadAll: function(cb) {
				var myCBCount = 0;
				var myCB = function() {
					myCBCount += 1;
					if (myCBCount < 3) {
						return;
					}
					cb();
				}
				
				function subSetHandler(subSet) {
					var regions = [];
					for (var regionId in subSet.regions) {
						if (!state.dag.hasRegion(regionId)) {
							regions.push(parseInt(regionId));
							state.dag.addNode(regionId, dag.NodeTypes.Region);
						}
					}
					//don't cache shapes here! there may be a lot of shapes!
					
					//get the cluster hints
					state.cqr.clusterHints(regions, function(hints) {
						for(var regionId in hints) {
							console.assert(state.dag.hasRegion(regionId));
							state.dag.region(regionId).clusterHint = hints[regionId];
						}
						myCB();
					});
					
					//fetch the item info
					oscar.getItems(regions,
						function (items) {
							for (var i in items) {
								var item = items[i];
								var node = state.dag.region(item.id());
								node.name = item.name();
								node.bbox = item.bbox();
							}
							myCB();
						},
						function(p1, p2) {
							tools.defErrorCB(p1, p2);
							myCB();
						}
					);
					
					for (var regionId in subSet.regions) {
						state.dag.region(regionId).count = subSet.regions[regionId].apxitems;
						var children = subSet.regions[regionId].children;
						if (children.length) {
							for (var i in children) {
								state.dag.addChild(state.dag.region(regionId), state.dag.region(children[i]));
							}
						}
						else {
							state.dag.at(regionId).isLeaf = true;
						}
					}

					for (var j in subSet.rootchildren) {
						state.dag.addChild(state.dag.region(0xFFFFFFFF), state.dag.region(subSet.rootchildren[j]));
					}
					myCB();
				}

				state.cqr.getDag(subSetHandler, tools.defErrorCB);
			},
			
			//if cb is called, all relevant items should be in the cache
			//offset is currently unsupported
			expandCellItems: function(cellIds, cb, offset) {
				spinner.startLoadingSpinner();
				if (cellIds instanceof 5) {
					cellIds = [cellIds];
				}
				de.cellItemExpander.fetch(cellIds, function() {
					spinner.endLoadingSpinner();
					cb();
				});
			},

			expandRegionCells: function(regionIds, cb) {
				if (regionIds instanceof 5) {
					regionIds = [regionIds];
				}
				spinner.startLoadingSpinner();
				de.regionCellExpander.fetch(regionIds, function() {
					spinner.endLoadingSpinner();
					cb();
				});
			},
	   
			expandRegionChildren: function(regionIds, cb) {
				if (regionIds instanceof 5) {
					regionIds = [regionIds];
				}
				spinner.startLoadingSpinner();
				de.regionChildrenExpander.fetch(regionIds, function() {
					spinner.endLoadingSpinner();
					cb();
				});
			}
		}
	};
	
	return {
		dagExpander: function() {
			return dagExpander();
		}
	};
});

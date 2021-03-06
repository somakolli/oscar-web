define(["dagre-d3", "d3", "jquery", "oscar", "state", "tools", "dag"], function (dagreD3, d3, $, oscar, state, tools, dag) {
    var tree = {
        graph: undefined, // the graph
        renderer: new dagreD3.render(),

        /**
         * visualizes the DAG
         *
         * @param root
         */
        visualizeDAG: function (root) {
            state.visualizationActive = true;

            // Set up an SVG group so that we can translate the final graph.
            $("#dag").empty();
            var svg = d3.select("svg");
			var svgGroup = svg.append("g");

            this._initGraph(svg, svgGroup);

            // build the graph from current DAG
            this._recursiveAddToGraph(root);
			this._roundedNodes();

			// Center the graph
			var xCenterOffset = ($("#tree").width() - this.graph.graph().width) / 2;
			svgGroup.attr("transform", "translate(" + xCenterOffset + ", 20)");
			svg.attr("height", this.graph.graph().height + 40);
			
			this._addInteractions();

			$("#tree").css("display", "block");
			
			if (this.graph.nodeCount() > 1000) {
				var cId = this._findMaxCountLeafNode(root);
				this.onePath(state.dag.region(cId));
				$("#onePath").prop('checked', true);
			}
			else {
				// draw graph
				svgGroup.call(this.renderer, this.graph);
			}
        },

        _initGraph: function (svg, svgGroup) {
            // Create the input graph
            this.graph = new dagreD3.graphlib.Graph()
                .setGraph({
                    nodesep: 15,
                    ranksep: 75,
                    rankdir: "TB",
                    marginx: 10,
                    marginy: 10
                })
                .setDefaultEdgeLabel(function () {
                    return {};
                });

            // Set up zoom support
            var zoom = d3.behavior.zoom().on("zoom", function () {
                svgGroup.attr("transform", "translate(" + d3.event.translate + ")" +
                    "scale(" + d3.event.scale + ")");
            });
            svg.call(zoom);

            this.graph.graph().transition = function (selection) {
                return selection.transition().duration(500);
            };
        },

        /**
         * adds a click event to all "Show Children" links, which loads the sub-hierarchy
         *
         * @private
         */
        _addClickToLoadSubHierarchy: function () {
            $(".treeNodeSub").each(function (key, value) {
                $(value).on("click", function () {
                    var id = parseInt( $(this).attr("nodeId") );
                    state.mapHandler.expandRegion(id, function () {
						if (!state.dag.hasRegion(id)) {
							return;
						}
						if ($("#onePath").prop('checked')) {
							tree.onePath(state.dag.region(id));
						}
						else if (state.visualizationActive) {
							tree.refresh(id);
						}
						state.mapHandler.zoomTo(id);
                    });
                });
            });
        },

        _addClickToShowRegion: function () {
            $(".treeNodeShow").each(function (key, value) {
                $(value).on("click", function () {
                    var id = parseInt( $(this).attr("nodeId") );
					state.mapHandler.zoomTo(id);
                });
            });
        },
	   
        _addClickToLoadItems: function () {
            $(".treeNodeItems").each(function (key, value) {
                $(value).on("click", function () {
                    var id = parseInt( $(this).attr("nodeId") );
					state.mapHandler.zoomTo(id);
					//loading items for the region is currently not supported
                });
            });
        },
		
		_addClickToOnePath: function() {
            $(".treeNodeOnePath").each(function (key, value) {
                $(value).on("click", function () {
                    var id = parseInt( $(this).attr("nodeId") );
					$("#onePath").prop('checked', true);
					$("#onePath").button("refresh");
					tree.onePath(state.dag.region(id));
                });
            });
		},

        _recursiveAddToGraph: function (node) {
			this.graph.setNode(node.id, tree._nodeAttr(node));
			node.children.each(function(childId) {
				var child = state.dag.region(childId);
				if (child.count && child.name) {
					tree._recursiveAddToGraph(child);
					tree.graph.setEdge(node.id, child.id, {
						lineInterpolate: 'basis',
						class: "origin-" + node.id
					});
				}
			});
        },

        /**
         * returns the label for a node (non-leaf) in the tree
         *
         * @param name of the node
         * @param id of the node
         * @returns {string} label-string
         */
        _nodeLabel: function (node) {
            var label = "<div class='treeNode'>";
			label += "<div class='treeNodeName'>" + node.name.toString() + "<span class='badge'>" + node.count + "</span></div>";
			if (!node.isLeaf && !node.children.size()) {
				label += "<a nodeId='" + node.id+ "' class='treeNodeSub treeNodeLink' href='#'>Load children</a>";
			}
			label += "<a nodeId='" + node.id + "' class='treeNodeShow treeNodeLink' href='#'>Show</a>";
			label += "<a nodeId='" + node.id + "' class='treeNodeOnePath treeNodeLink' href='#'>One Path</a>";
			label += "</div>";
			return label;
        },

        /**
         * returns the attributes for a node
         *
         * @param node TreeNode instance
         * @returns {*} attributes for the node
         */
        _nodeAttr: function (node) {
			return {
				labelType: "html",
				label: tree._nodeLabel(node)
			};
        },

        /**
         * mouseover effect for nodes in the tree
         *
         * @param id node-id
         * @private
         */
        _hoverNode: function (id) {
            d3.selectAll(".origin-" + id).selectAll("path").style("stroke", "#007fff");
        },

        /**
         * mouseout effect for nodes in the tree
         *
         * @param id node-id
         * @private
         */
        _deHoverNode: function (id) {
            d3.selectAll(".origin-" + id).selectAll("path").style("stroke", "black");
        },

        /**
         * rounds the edges of nodes
         *
         * @private
         */
        _roundedNodes: function () {
            this.graph.nodes().forEach(function (v) {
				if (tree.graph.node(v) === undefined) {
					var dn = state.dag.region(v);
					console.log(dn);
				}
                var node = tree.graph.node(v);
                node.rx = node.ry = 5;
            });
        },

        /**
         * refreshs/redraws the tree, the node-id defines a node, which subtree changed
         *
         * @param id node-id
         */
        refresh: function (id) {
            // ugly hack: attributes for nodes cannot be changed, once set (or they will not be recognized). so we have
            // to remove the node & create a new one with the wished properties
            var pathtimer = tools.timer("refresh");
            var parents = this.graph.inEdges(id);
            this.graph.removeNode(id);
            //d3.select("svg").select("g").call(this.renderer, this.graph);
            this.graph.setNode(id, {label: state.dag.region(id).name.toString(), labelStyle: "color: white"});
            for (var i in parents) {
                this.graph.setEdge(parents[i].v, id, {
                    lineInterpolate: 'basis',
                    class: "origin-" + parents[i].v
                });
            }

            // update the subtree of the clicked node
            this._recursiveAddToGraph(state.dag.region(id), this.graph);
            this._roundedNodes();
            d3.select("svg").select("g").call(this.renderer, this.graph);
            this._addInteractions();
            pathtimer.stop();
        },

        /**
         * adds interactions to the graph-visualization
         * 1) mouseover effects
         * 2) mouseout effects
         * 3) possibility to load subhierarchy of nodes
         *
         * @private
         */
        _addInteractions: function () {
            d3.selectAll(".node").on("mouseover", this._hoverNode.bind(this));
            d3.selectAll(".node").on("mouseout", this._deHoverNode.bind(this));
            this._addClickToLoadSubHierarchy();
			this._addClickToShowRegion();
			this._addClickToOnePath();
        },

        /**
         *
         * @param node to which should be found one path to the root
         */
        onePath: function (node) {
            function walker(node) {
                var parentNode;
                for (let parentId of node.parents.builtinset()) {
                    parentNode = state.dag.region(parentId);
                    if (!parentNode) {
                        continue;
                    }
                    if (walkerCounter.count(parentNode.id)) {
                        walkerCounter.insert(parentNode.id, walkerCounter.at(parentNode.id) + 1);
                    } else {
                        walkerCounter.insert(parentNode.id, 1);
                    }
                    walker(parentNode);
                }
            }

            $("#dag").empty();
            var svg = d3.select("svg");
            var svgGroup = svg.append("g");
            tree._initGraph(svg, svgGroup);

            var walkerCounter = tools.SimpleHash();
            var onPath = tools.SimpleHash();

            walker(node);

            var currentNode = state.dag.region(0xFFFFFFFF); // root
            var childNode, nextNode, mostWalkers = 0;

            while (currentNode.id != node.id) {
                this.graph.setNode(currentNode.id, tree._nodeAttr(currentNode));

                for (let childId of currentNode.children.builtinset()) {
                    childNode = state.dag.region(childId);
                    this.graph.setNode(childNode.id, tree._nodeAttr(childNode));
                    this.graph.setEdge(currentNode.id, childNode.id, {
                        lineInterpolate: 'basis',
                        class: "origin-" + currentNode.id
                    });
                    if (childNode.id == node.id) {
                        nextNode = childNode;
                        mostWalkers = Number.MAX_VALUE;
                        //break;
                    } else if (walkerCounter.at(childNode.id) > mostWalkers) {
                        nextNode = childNode;
                        mostWalkers = walkerCounter.at(childNode.id);
                    }
                }

                onPath.insert(currentNode.id, currentNode);
                currentNode = nextNode;
                mostWalkers = 0;
            }

            this.graph.setNode(node.id, tree._nodeAttr(node));
            tree.refresh(node.id);
            d3.select("svg").select("g").call(this.renderer, this.graph);
            tree._addInteractions();
			$("#onePath").prop("checked", true);
        },

        hideChildren: function (node) {
            var childNode;
            for (let childId of node.children.builtinset()) {
                childNode = state.dag.region(childId);
                tree.graph.removeNode(childNode.id);
            }
        },
        
        _findMaxCountLeafNode: function(root) {
			var maxCountNodeId = root.id;
			var f = function(node) {
				if (!node.children.size()) {
					maxCountNodeId = node.id;
				}
				else {
					let cId = 0;
					let cm = 0;
					node.children.each(function(childId) {
						let child = state.dag.region(childId);
						if (child.count > cm) {
							cId = childId;
							cm = child.count;
						}
					});
					f(state.dag.region(cId));
				}
			}
			f(root);
			return maxCountNodeId;
		}
    };

    return tree;
})
;

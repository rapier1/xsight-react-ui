var exports = module.exports = {};
var d3 = require('d3');

// Define UI elements. Most are initialized in init() function

var colorPalette = {
    "primary": { //blue
        "base": "#9ad3de",
        "lighter1": "#caecf3",
        "lighter2": "#f4fdfe",
        "darker1": "#6bb2c0",
        "darker2": "#428d9a"
    },
    "secondary": { //purple
        "base": "#a7abe5",
        "lighter1": "#d1d3f5",
        "lighter2": "#f6f6fe",
        "darker1": "#7c82cc",
        "darker2": "#565cae"
    },
    "tertiary": { //green
        "base": "#b2f1a5",
        "lighter1": "#d6facf",
        "lighter2": "#f6fff5",
        "darker1": "#8ee47c",
        "darker2": "#6cd156"
    },
    "complementary": { //orange
        "base": "#ffd6af",
        "lighter1": "#ffe8d3",
        "lighter2": "#fffaf5",
        "darker1": "#ffc488",
        "darker2": "#fbaf68"
    }
};

var rootElem = null; // Html Element this app is rendered in. Assigned in init()

var width, height;

var force;

var svg;

var link, node;

var tooltip;

var tags, nodeTypes=[];

var root;
var currentNode = root;

var inputCallback = null; // function to call on user input
var sourceContext = {
    database: '',
    network: '',
    domain: '',
    host: ''
};

// Define functions
function init(elem, width, height){
    console.log("force graph init");
    // Get root element to render in from caller
    rootElem = elem;

    //TODO how to get height&width from rootElem?
    width = window.innerWidth;
    height = window.innerHeight * 0.75;


    force = d3.layout.force()
    .size([width, height])
    .linkDistance(200)
    .charge(-1000)
    .on("tick", tick);
    
    svg = d3.select(rootElem)
    .style("background-color", colorPalette.primary.base)
    .append("svg")
    .attr("width", width)
    .attr("height", height);
    
    link = svg.selectAll(".link"),
    node = svg.selectAll(".node");
    
    tooltip = d3.select(rootElem)
    .append("div")
    .style("background", "#333")
    .style("background", "rgba(0,0,0,0.8")
    .style("color", "#FFF")
    .style("position", "absolute")
    .style("z-index", "10")
    .style("border-radius", "5px")
    .style("padding", "5px")
    .style("visibility", "hidden")
    .text("a simple tooltip");
    
    tags = {"series":[{"name":"netnameTagValues","columns":["netname"],"points":[["ALL"],["XSEDE"]]},{"name":"domainTagValues","columns":["domain"],"points":[["PSC"]]},{"name":"dtnTagValues","columns":["dtn"],"points":[["firehose2"],["firehose6"]]}]} 
    nodeTypes = ["database", "network", "domain", "dtn"];

    var n = flattenAll_BF(root); // flattenAll should happen first, it defined the node IDs
    update(); // Start the update loop after all functions are defined
    collapseAll(); // graph starts in collapsed state 

}


function update(){
    var nodes = flattenVisible(root),
        links = d3.layout.tree().links(nodes);

    // Reset force layout
    force
          .nodes(nodes)
          .links(links)
          .start();

    // Update the links…
    link = link.data(links, function(d) { return d.target.id; })
        .attr("stroke-width", function(d){return 2;})
        .style("stroke", strokeColor);

    // Exit any old links.
    link.exit().remove();

    // Enter any new links.
    link.enter().insert("line", ".node")
        .attr("class", "link")
        .attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; })
        .attr("stroke-width", function(d){return 2;})
        .style("stroke", strokeColor);

    // Update the nodes…
    node = node.data(nodes, function(d) { return d.id; });
    node.selectAll("circle")
        .attr("stroke-width", strokeWidth)
        .style("fill", fillColor)
        .style("stroke", strokeColor);
  
    // Exit any old nodes.
    node.exit().remove();
  
    // Enter any new nodes.
    var newNode = node.enter().append("g")  //create group to contain circle & text
        .on("click", click)
        .on("mouseover", onTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", outTooltip)
        .attr("class", "node");

    var circle = newNode.append("circle")   //create circle
        .attr("cx", function(d){return 0;})
        .attr("cy", function(d){return 0;})
        .attr("r", function(d){return circleScale(d.type);})
        .attr("stroke-width", strokeWidth)
        .attr("stroke", strokeColor)
        .attr("fill", fillColor);

    var text = newNode.append("text")       //create text
        .attr("text-anchor", "middle")
        .text(function(d){return d.name;});

    newNode.call(force.drag);

}


function tick() {
    link.attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; })
        .style("stroke", strokeColor);
  
    node.attr("transform", function(d){return "translate(" + d.x + "," + d.y + ")";});
}

// color based on node type: database, network, domain, or dtn
function fillColor(d) {
  return d.type == "database" ? colorPalette.secondary.darker2 : d.type == "network" ? colorPalette.secondary.darker1 : d.type == "domain" ? colorPalette.secondary.base : colorPalette.secondary.lighter1;
}


// if collapsed node get color1, if open node w/ children get color2, leaf get color3
function strokeColor(d) {
  return d._children ? colorPalette.complementary.darker2 : d.children ? colorPalette.complementary.base : colorPalette.complementary.lighter1;
}

// if collapsed node; if open node w/ children; if leaf node
function strokeWidth(d) {
  //return d._children ? 5 : d.children ? 4 : 3;
  return "0.8em";
}

var circleScale = d3.scale.ordinal().domain(nodeTypes).range([40,50,60,70]); // d3 doc says domain[0] should correspond to range[0], D[n]->R[n]. However this is doing the opposite of that..

// Toggle children on click.
function click(d){
  if (!d3.event.defaultPrevented) {
    currentNode = d;
    selectNode(d);
  }
}

// Tooltip: Mouse Hover event - return text and make visible
function onTooltip(d){
    if(d.children){
        tooltip.text(d.type+" selected");
    } else if(d._children){
        tooltip.text("Click to select "+d.type);
    } else {
        tooltip.text(d.type);
    }
    
    tooltip.style("border-radius", "5px")
        .style("visibility", "visible");
}

// Tooltip: Mouse Move event - follow mouse position
function moveTooltip(d){ 
    var coords = d3.mouse(rootElem);
    tooltip.style("top", (coords[1]-10)+"px").style("left",(coords[0]+10)+"px");
}

// Tooltip: Mouse Out event - hide tooltip
function outTooltip(d){
    tooltip.style("visibility", "hidden");
}

// Returns a list of all *visible* nodes under the root.
// Will *not* index nodes
// depth-first traversal
function flattenVisible(root){
  var nodes = [], i = 0;

  function recurse(node, indx, arr) {
    if (node.children) node.children.forEach(recurse);
    nodes.push(node);
  }

  recurse(root, 0, null);
  return nodes;
}

// Returns a list of all (visible & hidden) nodes under the root.
// Will index nodes
// depth-first traversal
function flattenAll_DF(root){
  var nodes = [], i=0, p=0;

  function recurse(node, indx, arr) {
    if(!node.parent){node.parent = p;}
    if(!node.id){
        node.id = ++i;
        if(arr) arr[indx].id = node.id;
    }
    if(node.children){node.children.forEach(recurse);}
    else if(node._children){node._children.forEach(recurse);}
    p++;

    nodes.push(node);
  }

  recurse(root, 0, null);
  return nodes;
}

// Returns a list of all (visible & hidden) nodes under the root.
// Will index nodes
// Breadth-first traversal
function flattenAll_BF(root){
    var q = [], n = [] , i=0;

    q.push(root);

    while(q.length != 0){
        var node = q.shift(); //dequeue current node
        var children = node.children ? node.children : node._children;

        node.id = ++i; //index parent
        n.push(node);  //add to return list

        // link children to this parent node
        for(var j in children){
            if(!children[j].parent){children[j].parent = node.id;}
            q.push(children[j]); //enqueue child
        }
    }

    return n;
}

// Collapses each node in the tree
function collapseAll(){
    function recurse(node){
        if (node.children) node.children.forEach(recurse);  // recurse to bottom of tree
        if (node.children){                                 // hide children in _children then remove
            node._children = node.children;
            node.children = null;
        } 
    }

    recurse(root);
    update();
}

function getNodeByName(nodeName){
    var nodes = flattenAll_BF(root);
    for(var n in nodes){
        if(nodes[n].name == nodeName) return nodes[n];
    }
}

function getNodeById(nodeId){
    var nodes = flattenAll_BF(root);
    for(var n in nodes){
        if(nodes[n].id == nodeId) return nodes[n];
    }
}

// return array of nodes that are networks
function getAllNetworks(){
    var nets = [];
    var nodes = flattenAll_BF(root);
    for(var i in nodes){
        if(nodes[i].type == "network") nets.push(nodes[i]);
    }

    return nets;
}

// return array of nodes that are domains
function getAllDomains(){
    var domains = [];
    var nodes = flattenAll_BF(root);
    for(var i in nodes){
        if(nodes[i].type == "domain") domains.push(nodes[i]);
    }

    return domains;
}
// return array of nodes that are dtns 
function getAllDTNs(){
    var dtns = [];
    var nodes = flattenAll_BF(root);
    for(var i in nodes){
        if(nodes[i].type == "dtn") dtns.push(nodes[i]);
    }

    return dtns;
}

function getAllExpandedIDs(){
    var selectedIDs = [];
    var nodes = flattenAll_BF(root);
    for(var i=0; i<nodes.length; i++){
        if(nodes[i].children || (!nodes[i].children && !nodes[i]._children) ){
            selectedIDs.push(nodes[i].id); // if node is expanded (has visible children), add to list
        }
    }

    return selectedIDs;
}

function getAllType(type){
    switch(type){
        case "network":
            return getAllNetworks();
            break;
        case "domain":
            return getAllDomains();
            break;
        case "dtn":
            return getAllDTNs();
            break;
        default:
            return null;
    }
}

// Toggle visibility of the node object passed in. The node object should be from the tree root object
function toggleNode(n){
    if (n.children) {
      n._children = n.children;
      n.children = null;
    } else {
      n.children = n._children;
      n._children = null;
    }
    update();
}

// Hide node
function hideNode(n){
    if(n.children){
        n._children = n.children;
        n.children = null;
    }
    update();
}

// Show node
function showNode(n){
    if(n._children){
        n.children = n._children;
        n._children = null;
    }
    update();
}

// Select node: Hide siblings & expand node
function selectNode(n){
    collapseAll();
    for(var i in a=getAllType(n.type)){ // for each node of this type
        hideNode(a[i]);                 // hide
    }

    var selectedIDs = [];
    selectedIDs.push(n.id);

    // expand parent up to root
    var i=n.parent;
    while(i>0){
        showNode(getNodeById(i));
        selectedIDs.push(i);
        i = getNodeById(i).parent;
    }

    showNode(n); //show

    // update sourceContext when new sources are selected.
    // At this point only up to one node of each type is selected/expanded.
 

    clearSourceContext(); //remove old values
    for(var sid=0; sid<selectedIDs.length; sid++){
        var node = getNodeById(selectedIDs[sid]);
        switch(node.type){
            case "database":
                sourceContext.database = node.name;
                break;
            case "network":
                sourceContext.network = node.name;
                break;
            case "domain":
                sourceContext.domain = node.name;
                break;
            case "dtn":
                sourceContext.host = node.name;
                break;
            default:
                return null;
        }
    }

    // if callback is set, execute function. Used as custom event.
    if(inputCallback){
        inputCallback();
    }
}

function clearSourceContext(){
    sourceContext = {
        database: '',
        network: '',
        domain: '',
        host: ''
    };
}

function getSourceContext(){
    return sourceContext;
}

function setInputCallback(func){
    inputCallback = func;
}

//TODO Returns graph structure constructed from API data
function buildGraph(graphData){
  var g = {"name": "Xsight Database", children: []};

  for(var i=0; i<graphData.series.length; i++ ){
    var item = graphData.series[i];
    for(var p in item.points){
      g.children[i] = {"name": item.points[p][0]};
    }
  }

  return g;
}

function setGraph(aGraph){
    root = aGraph;
}


exports.init = init;
exports.setGraph = setGraph;
exports.update = update;
exports.getSourceContext = getSourceContext;
exports.setInputCallback = setInputCallback;

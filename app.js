#!/usr/bin/env node

var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var gexf = require('gexf');
var argv = require('yargs').argv;

var filename = typeof argv.output !== 'undefined' ?  argv.output : "data-model",
    server   = typeof argv.server !== 'undefined' ?  argv.server : 'http://localhost:7474',
    user     = typeof argv.user   !== 'undefined' ?  argv.server : 'neo4j',
    pass     = typeof argv.pass   !== 'undefined' ?  argv.pass   : 'neo4j',
    labels, tasks = {};

var dbLocal = require("seraph")({
  server : server,
  user  : user,
  pass  : pass
});

// query
function getLabels(){
  dbLocal.query("MATCH (m) WITH labels(m) AS l return DISTINCT l", function(err, result) {
    if (err) throw err;
    getKeys(result);
  });
};
function getKeys(labels){

  _.forEach(labels, function(label) {

      tasks[label] =  function(next) {

        async.parallel(
          {
            props: function(next2) {
              dbLocal.query("MATCH m WHERE "+labelsToQuery(label)+" RETURN DISTINCT keys(m)", function(err, result) {
                if (err) throw err;
                return next2(null, _.union(_.flatten(result)));
              });
            },
            relations: function(next2){
              dbLocal.query("MATCH (m)-[r]->(t) WHERE "+labelsToQuery(label)+" RETURN DISTINCT type(r) as type ,labels(t) as labels", function(err, result) {
                if (err) throw err;
                return next2(null, _.flatten(result));
              });
            }
          },
          function(err, results) {
            if (err) throw err;
            return next(null, results);
          }
        )
      }

  });

  async.parallel(tasks,
    function(err, results) {
       if(argv.dot) saveDotGraph(results);
       if(argv.json) saveJSON(results);
       if(argv.gefx) saveGefx(results);
    }
  );
};

// helpers
function labelsToQuery(labels){

  var query="", sep="";

  _.forEach(labels, function(label) {
    query = query+sep+"m:"+label;
    sep=" AND ";
  });

  return query;
};
function getIndexIfObjWithAttr(array, attr, value) {
  for(var i = 0; i < array.length; i++) {
      if(array[i][attr] === value) {
          return i;
      }
  }
  return -1;
};

// exports
function saveGefx(results){

  var data = {nodes:[], edges:[]};
  var myGexf = gexf.create({
    model: {
      node: [
        {
          id: "type",
          type: "string",
          title: "Node type"
        }
      ],
      edge: [
        {
          id: "type",
          type: "string",
          title: "Edge type"
        },
        {
          id: "predicate",
          type: "string",
          title: "predicate label"
        },
      ],
    },

  });

    _.forEach(results, function(node, key) {

    // create Node (unique label combination )
    var newNode = {
      id: 'n'+data.nodes.length,
      label: key,
      attributes: {type:'entity'}
    }

    data.nodes.push(newNode);
    myGexf.addNode(newNode);

    _.forEach(node.props, function(prop) {

      // create Node Property keys
      var newProp = {
        id: 'n'+ data.nodes.length,
        label: prop,
        attributes: {type:'key'}
      };

      data.nodes.push(newProp);
      myGexf.addNode(newProp);

      // create edge between Property keys to label
      var newEdge = {
        id: 'e'+data.edges.length,
        type: "directed",
        source: newNode.id,
        target: newProp.id,
        attributes: {
          type:'key'
        }
      }

      data.edges.push(newEdge);
      myGexf.addEdge(newEdge);
    });
  });

  _.forEach(results, function(node, key) {
    _.forEach(node.relations, function(relation) {

      // find id for each nodes relations
      sourceindex = getIndexIfObjWithAttr(data.nodes, "label", key);
      targetindex = getIndexIfObjWithAttr(data.nodes, "label", _(relation.labels).toString());

      var newEdge = {
        id: 'e'+data.edges.length,
        source: 'n'+sourceindex,
        target: 'n'+targetindex,
        attributes: {
          predicate: relation.type,
          type:'predicate'
        }
      }

      // create edge between nodes
      data.edges.push(newEdge);
      myGexf.addEdge(newEdge);

    });
  });

  fs.writeFileSync("./"+filename+".gexf", myGexf.serialize());
  console.log("gfx saved!");
};
function saveJSON(results){

  var data = {nodes:[], edges:[]};

  _.forEach(results, function(node, key) {

    // create Node (unique label combination )
    var newNode = {type:'entity', label:key, name:key, id:data.nodes.length}
    data.nodes.push(newNode);

    _.forEach(node.props, function(prop) {

      // create Node Property keys
      var newProp = {type:'key', label:prop, name:prop, id:data.nodes.length};
      data.nodes.push(newProp);

      // link Property keys to label
      data.edges.push({type:'key', source:newNode.id, target:newProp.id, label:''});
    });
  });

  _.forEach(results, function(node, key) {
    _.forEach(node.relations, function(relation) {

      sourceindex = getIndexIfObjWithAttr(data.nodes, "name", key);
      targetindex = getIndexIfObjWithAttr(data.nodes, "name", _(relation.labels).toString());

      data.edges.push({type:'predicate', source:sourceindex, target:targetindex, name:relation.type});

    });
  });

  fs.writeFileSync("./"+filename+".json", JSON.stringify(data));
  console.log(filename+".json saved!");
};
function saveDotGraph(results){
  var graph, graphlight, nodes="", keys="", keylinks="", links="";

  // create keys
  _.forEach(results, function(node, key) {

    key = key.replace(',','_');
    nodes += " " + key + ";";

    _.forEach(node.props, function(prop) {

      var name = key+"_"+prop;

      keys +=  " "+name+"[label= "+prop+"]";
      keylinks = keylinks +" "+key+"->"+name + "[dir=none, style=dashed]";

    });

    _.forEach(node.relations, function(relation) {
        links += " "+key+"->"+_(relation.labels).toString().replace(',','_')+"[label=  "+relation.type+"]";
    });

  });

  nodes = 'subgraph { node [shape=hexagon style=filled, fillcolor=black, color=white fontcolor=white]; edge [penwidth=100]; '+ nodes +'}';
  keys  = 'subgraph { node [shape=invhouse]; '+ keys +'}';
  settings = 'layout=fdp; ';

  graph = 'digraph  {'+ settings +' '+nodes+' '+keys+' '+keylinks+' '+ links +'}';
  fs.writeFileSync("./"+filename+".dot", graph);
  console.log(filename+".dot saved!");

  graphlight = 'digraph  { '+ settings +' '+nodes+' '+ links +'}';
  fs.writeFileSync("./"+filename+".dot", graphlight);
  console.log(filename+"-light.dot saved!");
};

// start script

if(argv.h || argv.help) {
  console.log('Usage : ');
  console.log('add --json for json output');
  console.log('add --dot for dot/graphviz output');
  console.log('add --gefx for gephi output \n');
  console.log('ex: app.js --json --user neo4j --pass=neo4j --output filenameOutput \n');

}else{
  getLabels();
}

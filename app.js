
var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var gexf = require('gexf');

var dbLocal = require("seraph")({
  user: 'neo4j',
  pass: 'neo'
});

var labels;
var tasks = {};

// query

dbLocal.query("MATCH (m) WITH labels(m) AS l return DISTINCT l", function(err, result) {
  if (err) throw err;
  getKeys(result);
});

var getIndexIfObjWithAttr = function(array, attr, value) {
  for(var i = 0; i < array.length; i++) {
      if(array[i][attr] === value) {
          return i;
      }
  }
  return -1;
}

function labelsToQuery(labels){

  var query="", sep="";

  _.forEach(labels, function(label) {
    query = query+sep+"m:"+label;
    sep=" AND ";
  });

  return query;
}
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
       genDotGraph(results);
       saveJSON(results);
       saveGefx(results);
    }
  );
}

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

      // link Property keys to label

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

      data.edges.push(newEdge);
      myGexf.addEdge(newEdge);
    });
  });


  fs.writeFileSync("data/graph.gexf", myGexf.serialize());
  console.log(data)
  console.log("gfx saved!");

}
function saveJSON(results){

  var data = {nodes:[], edges:[]};

  fs.writeFileSync("data/raw_data.json", JSON.stringify(results));
  console.log("rawdata saved!");

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

  fs.writeFileSync("data/data.json", JSON.stringify(data));
  console.log("data saved!");
}

function genDotGraph(results){
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
  fs.writeFileSync("data/graph.dot", graph);
  console.log("graph saved!");

  graphlight = 'digraph  { '+ settings +' '+nodes+' '+ links +'}';
  fs.writeFileSync("data/graphlight.dot", graphlight);
  console.log("graphlight saved!");
}

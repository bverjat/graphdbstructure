
var _ = require('lodash');
var async = require('async');
var fs = require('fs');

var dbLocal = require("seraph")({
  user: 'neo4j',
  pass: 'neo'
});

var labels;
var tasks = {};

// query

dbLocal.query("MATCH (m) WITH labels(m) AS l return DISTINCT l", function(err, result) {
  if (err) throw err;

  labels = result;
  getKeys(labels);

});

function labelsToQuery(labels){

  var query="", sep="";

  _.forEach(labels, function(label) {
    query = query+sep+"m:"+label;
    sep=" AND ";
  });

  return query;
}

function genDotLabel(labels){
  return _(labels).toString().replace(',','_');
}

function getKeys(labels){

  _.forEach(labels, function(label) {


      // console.log("q", "MATCH m WHERE "+labelsToQuery(label)+" RETURN DISTINCT keys(m)")

      tasks[label] =  function(next) {

        async.parallel(
          {
            props: function(next) {
              dbLocal.query("MATCH m WHERE "+labelsToQuery(label)+" RETURN DISTINCT keys(m)", function(err, result) {
                if (err) throw err;
                return next(null, _.union(_.flatten(result)));
              });
            },
            relations: function(next){
              dbLocal.query("MATCH (m)-[r]->(t) WHERE "+labelsToQuery(label)+" RETURN DISTINCT type(r) as type ,labels(t) as labels", function(err, result) {
                if (err) throw err;
                return next(null, _.flatten(result));
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
      fs.writeFile("data.json", JSON.stringify(results), function(err) {
        if(err) return console.log(err);
        console.log("Data saved!");
      });

       genDotGraph(results);

    }
  );
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
        links += " "+key+"->"+genDotLabel(relation.labels)+"[label=  "+relation.type+"]";
    });
  });

  nodes = 'subgraph { node [shape=hexagon style=filled, fillcolor=black, color=white fontcolor=white]; edge [penwidth=100]; '+ nodes +'}';
  keys  = 'subgraph { node [shape=invhouse]; '+ keys +'}';
  settings = ' ranksep=3; layout=dot; '


  graph = 'digraph  {'+ settings +' '+nodes+' '+keys+' '+keylinks+' '+ links +'}';
  graphlight = 'digraph  { '+ settings +' '+nodes+' '+ links +'}';

  fs.writeFileSync("graph.dot", graph);
  console.log("graph saved!");
  fs.writeFileSync("graphlight.dot", graphlight);
  console.log("graphlight saved!");
}

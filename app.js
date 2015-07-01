
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

function getKeys(labels){

  _.forEach(labels, function(label) {

      var label = label[0];
      tasks[label] =  function(next) {

        async.parallel(
          {
            keys: function(next) {
              dbLocal.query("MATCH (m: "+label+" ) return DISTINCT keys(m)", function(err, result) {
                if (err) throw err;
                return next(null, _.union(_.flatten(result)));
              });
            },
            relations: function(next){
              dbLocal.query("MATCH (c:"+label+")-[r]->(t) RETURN DISTINCT type(r),labels(t)", function(err, result) {
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
          console.log("The file was saved!");
      });
    }
  );
}




# -

exports neo4j data model

## database login
- `--user neo4j` 
- `--pass neo4j`
- `--server http://localhost:7474`
  
## specify output type
- `--json` for json 
- `--dot` for dot / <http://graphviz.org>
- `--gefx` for gefx / <http://gephi.github.io>

## specify output filename

- `--output myFilename` without extension

## example
`app.js --json --gefx --dot --user neo4j --pass=neo4j --output filenameOutput`

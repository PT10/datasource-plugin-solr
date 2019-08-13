'use strict';

System.register(['lodash', 'jquery', 'moment', 'app/core/utils/datemath'], function (_export, _context) {
  "use strict";

  var _, $, moment, dateMath, _createClass, SolrDatasource;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  return {
    setters: [function (_lodash) {
      _ = _lodash.default;
    }, function (_jquery) {
      $ = _jquery;
    }, function (_moment) {
      moment = _moment.default;
    }, function (_appCoreUtilsDatemath) {
      dateMath = _appCoreUtilsDatemath;
    }],
    execute: function () {
      _createClass = function () {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }

        return function (Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      }();

      _export('SolrDatasource', SolrDatasource = function () {
        function SolrDatasource(instanceSettings, $q, backendSrv, templateSrv) {
          _classCallCheck(this, SolrDatasource);

          this.url = instanceSettings.url;
          if (this.url.endsWith('/')) {
            this.url = this.url.substr(0, this.url.length - 1);
          }
          this.basicAuth = instanceSettings.basicAuth;
          this.withCredentials = instanceSettings.withCredentials;
          this.name = instanceSettings.name;
          //this.collection = instanceSettings.jsonData.collection;
          this.$q = $q;
          this.templateSrv = templateSrv;
          this.backendSrv = backendSrv;
          this.solrCollection = instanceSettings.jsonData.solrCollection;
          this.solrCloudMode = instanceSettings.jsonData.solrCloudMode;

          // Helper to make API requests to Solr. To avoid CORS issues, the requests may be proxied
          // through Grafana's backend via `backendSrv.datasourceRequest`.
          this._request = function (options) {
            options.url = this.url + options.url;
            options.method = options.method || 'GET';
            options.inspect = {
              'type': 'solr'
            };

            if (this.basicAuth) {
              options.withCredentials = true;
              options.headers = {
                "Authorization": this.basicAuth
              };
            }

            return backendSrv.datasourceRequest(options);
          };
        }

        // Test the connection to Solr by querying collection response.


        _createClass(SolrDatasource, [{
          key: 'testDatasource',
          value: function testDatasource() {
            return this.doRequest({
              url: this.url + '/',
              method: 'GET'
            }).then(function (response) {
              if (response.status === 200) {
                return {
                  status: "success",
                  message: "Data source is working",
                  title: "Success"
                };
              } else {
                return {
                  status: "error",
                  message: "Data source is NOT working",
                  title: "Error"
                };
              }
            });
          }
        }, {
          key: 'query',
          value: function query(queryOptions) {
            //console.log('QUERY: ' + JSON.stringify(queryOptions));
            var self = this;

            var targetPromises = _(queryOptions.targets).filter(function (target) {
              return target.target && !target.hide;
            }).map(function (target) {
              if (!target.collection || !target.time) {
                return [];
              }
              if (target.groupEnabled === 'group' && !target.groupByField) {
                return [];
              }
              //var url = '/api/v' + self.apiVersion + '/timeseries';
              //fq=time:[2018-01-24T02:59:10.000Z TO 2018-01-24T14:59:10.000Z]
              var url = '/solr/' + target.collection + '/select?wt=json';
              //var rows = queryOptions.maxDataPoints || '100000';
              var rows = target.rows;
              var q = self.templateSrv.replace(target.target, queryOptions.scopedVars);
              q = self.queryBuilder(q);
              var rawParams = target.rawParams ? target.rawParams.split('&') : [];
              var query = {
                //query: templateSrv.replace(target.target, queryOptions.scopedVars),
                fq: target.time + ':[' + queryOptions.range.from.toJSON() + ' TO ' + queryOptions.range.to.toJSON() + ']',
                q: q,
                fl: target.time + ',' + target.fields,
                rows: rows,
                sort: target.time + ' desc',
                start: target.start
                //from: queryOptions.range.from.toJSON(),
                //to: queryOptions.range.to.toJSON(),
              };

              rawParams.map(function (p) {
                var tuple = p.split('=');
                var val = tuple[1].replace('__START_TIME__', queryOptions.range.from.toJSON()).replace('__END_TIME__', queryOptions.range.to.toJSON());
                query[tuple[0]] = val;
              });
              if (target.groupEnabled === 'group') {
                query.group = true;
                query['group.field'] = target.groupByField;
                self.groupByField = target.groupByField;
                query['group.limit'] = target.groupLimit;
              }

              self.time = target.time;

              var requestOptions;

              requestOptions = {
                method: 'GET',
                url: url,
                params: query
              };

              return self._request(requestOptions).then(_.bind(self.convertResponse, self, _, target.outputFormat));
            }).value();

            return this.$q.all(targetPromises).then(function (convertedResponses) {
              var result = {
                data: _.map(convertedResponses, function (convertedResponse) {
                  return convertedResponse.data;
                })
              };
              result.data = _.flatten(result.data);
              //console.log('RESULT: ' + JSON.stringify(result));
              return result;
            });
          }
        }, {
          key: 'queryBuilder',
          value: function queryBuilder(query) {
            return query.replace(/{/g, '(').replace(/}/g, ')').replace(/,/g, ' OR ');
          }
        }, {
          key: 'getOptions',
          value: function getOptions(query) {
            return [];
          }
        }, {
          key: 'listCollections',
          value: function listCollections(query) {
            // solr/admin/collections?action=LIST&wt=json
            if (!this.solrCloudMode) {
              return [];
            }
            var url = this.url + '/solr/admin/collections?action=LIST&wt=json';
            var requestOptions;

            requestOptions = {
              method: 'GET',
              url: url
            };

            return this.doRequest(requestOptions).then(this.mapToTextValue);
          }
        }, {
          key: 'listFields',
          value: function listFields(query, collection) {
            // solr/admin/collections?action=LIST&wt=json
            if (!collection) {
              return [];
            }
            var url = this.url + '/solr/' + collection + '/select?q=*:*&wt=csv&rows=1';
            var requestOptions;

            requestOptions = {
              method: 'GET',
              url: url
            };

            return this.doRequest(requestOptions).then(this.mapToTextValue);
          }
        }, {
          key: 'listRawParams',
          value: function listRawParams() {
            return [{
              text: 'HeatMap Facet Query',
              value: 'facet=true&json.facet={"heatMapFacet":{"numBuckets":true,"offset":0,"limit":10000,"type":"terms","field":"jobId","facet":{"Day0":{"type":"range","field":"timestamp","start":"__START_TIME__","end":"__END_TIME__","gap":"+1HOUR","facet":{"score":{"type":"query","q":"*:*","facet":{"score":"max(score_value)"}}}}}}}'
            }, {
              text: 'Get Raw Messages',
              value: 'getRawMessages=true'
            }];
          }
        }, {
          key: 'listOutputFormats',
          value: function listOutputFormats() {
            return [{
              text: 'Table',
              value: 'table'
            }, {
              text: 'Chart',
              value: 'chart'
            }];
          }
        }, {
          key: 'metricFindQuery',
          value: function metricFindQuery(query) {
            //q=*:*&facet=true&facet.field=CR&facet.field=product_type&facet.field=provincia&wt=json&rows=0
            if (!this.solrCollection) {
              return [];
            }
            var facetFields = query;
            var url = this.url + '/solr/' + this.solrCollection + '/select?q=*:*&facet=true&facet.field=' + facetFields + '&wt=json&rows=0';

            return this.doRequest({
              url: url,
              method: 'GET'
            }).then(this.mapToTextValue);
          }
        }, {
          key: 'mapToTextValue',
          value: function mapToTextValue(result) {
            if (result.data.collections) {
              return result.data.collections.map(function (collection) {
                return {
                  text: collection,
                  value: collection
                };
              });
            }
            if (result.data.facet_counts) {
              var ar = [];
              for (var key in result.data.facet_counts.facet_fields) {
                if (result.data.facet_counts.facet_fields.hasOwnProperty(key)) {
                  var array = result.data.facet_counts.facet_fields[key];
                  for (var i = 0; i < array.length; i += 2) {
                    // take every second element
                    ar.push({
                      text: array[i],
                      expandable: false
                    });
                  }
                }
              }
              return ar;
            }
            if (result.data) {
              return result.data.split('\n')[0].split(',').map(function (field) {
                return {
                  text: field,
                  value: field
                };
              });
            }
          }
        }, {
          key: 'convertResponseUngrouped',
          value: function convertResponseUngrouped(response, format) {
            var data = response.data;
            var seriesList;
            var series = {};
            var self = this;

            // Process heatmap facet response
            if (data.facets && data.facets.heatMapFacet) {
              seriesList = [];
              var jobs = data.facets.heatMapFacet.buckets;
              _(jobs).forEach(function (job) {
                var dayBuckets = job.Day0.buckets;
                var seriesData = [];
                _(dayBuckets).forEach(function (bucket) {
                  if (bucket.score && bucket.score.score) {
                    seriesData.push([bucket.score.score, moment.utc(bucket.val).valueOf()]);
                  }
                });
                seriesList.push({
                  target: job.val,
                  datapoints: seriesData
                });
              });
            } else if (format === 'table') {
              // Table
              var columns = [];
              var rows = [];
              seriesList = {};
              var index = 0;
              _(data.response.docs).forEach(function (item) {
                var row = [];
                for (var property in item) {
                  // Set columns
                  if (index == 0 && item.hasOwnProperty(property)) {
                    if (property == self.time) {
                      columns.push({ type: "time", text: 'Time' });
                    } else {
                      columns.push({ type: "string", text: property });
                    }
                  }
                  // Set rows
                  if (property === self.time) {
                    var ts = moment.utc(item[self.time]).valueOf(); //.unix() * 1000;
                    row.push(ts);
                  } else {
                    row.push(item[property]);
                  }
                }
                index++;
                rows.push(row);
              });
              seriesList = {
                type: "table",
                columns: columns,
                rows: rows
              };
            } else {
              // Charts
              seriesList = [];
              _(data.response.docs).forEach(function (item) {
                for (var property in item) {
                  if (item.hasOwnProperty(property) && property != self.time) {
                    // do stuff
                    if (typeof series[property] === 'undefined') {
                      series[property] = [];
                    }
                    var ts = moment.utc(item[self.time]).valueOf(); //.unix() * 1000;
                    series[property].push([item[property] || 0, ts]);
                  }
                }
              });
              for (var property in series) {
                seriesList.push({
                  target: property,
                  datapoints: series[property].reverse()
                });
              }
            }

            return {
              data: seriesList
            };
          }
        }, {
          key: 'convertResponseGrouped',
          value: function convertResponseGrouped(response) {
            var data = response.data;
            var groupBy = data.responseHeader.params['group.field'];
            var seriesList = [];
            // Recover the timestamp variable used for filtering
            var time = response.data.responseHeader.params.fl.split(',')[0];
            var datapoints = {};
            _(data.grouped[groupBy].groups).forEach(function (item) {
              // var target = item.groupValue || 'N/A';
              for (var i = 0; i < item.doclist.docs.length; i++) {
                for (var property in item.doclist.docs[i]) {
                  if (item.doclist.docs[i].hasOwnProperty(property) && property != time) {
                    var t = moment.utc(item.doclist.docs[i][time]).unix() * 1000;
                    var key = item.groupValue + ':' + property;
                    if (datapoints[key] == undefined) {
                      datapoints[key] = [];
                    }
                    datapoints[key].push([item.doclist.docs[i][property], t]);
                  }
                }
              }
              /*seriesList.push({
                target: target,
                datapoints: datapoints.reverse()
              });*/
              seriesList = [];
              for (var prop in datapoints) {
                seriesList.push({
                  target: prop,
                  datapoints: datapoints[prop].reverse()
                });
              }
            });
            return {
              data: seriesList
            };
          }
        }, {
          key: 'convertResponse',
          value: function convertResponse(response, format) {

            var data = response.data;

            if (!data) {
              return [];
            }

            if (data.response) {
              return this.convertResponseUngrouped(response, format);
            }

            if (data.grouped) {
              return this.convertResponseGrouped(response);
            }

            return [];
          }
        }, {
          key: 'annotationQuery',
          value: function annotationQuery(options) {
            var annotation = options.annotation;
            var baseQuery = this.templateSrv.replace(annotation.query, {}, "glob") || "*:*";
            var timeField = annotation.timeField || "timestamp_dt";
            var collection = annotation.collection || "annotations";
            var tagsField = annotation.tagsField || "tags";
            var titleField = annotation.titleField || "desc";
            var textField = annotation.textField || null;
            var start = options.range.from.toISOString();
            var end = options.range.to.toISOString();
            var query = {
              q: baseQuery + ' AND ' + timeField + ':[' + start + ' TO ' + end + ']',
              limit: 10
            };

            var url = this.url + '/solr/' + collection + '/select?wt=json&defType=edismax';

            var requestOptions;

            requestOptions = {
              method: 'GET',
              url: url,
              params: query
            };

            return this.doRequest(requestOptions).then(function (result) {
              return _.map(result.data.response.docs, function (doc) {
                return {
                  annotation: annotation,
                  time: moment(doc[timeField]).valueOf(),
                  title: doc[titleField],
                  tags: doc[tagsField],
                  text: doc[textField]
                };
              });
            });
          }
        }, {
          key: 'doRequest',
          value: function doRequest(options) {
            options.withCredentials = this.withCredentials;
            options.headers = this.headers;
            if (this.basicAuth) {
              options.withCredentials = true;
              options.headers = {
                "Authorization": this.basicAuth
              };
            }

            return this.backendSrv.datasourceRequest(options);
          }
        }]);

        return SolrDatasource;
      }());

      _export('SolrDatasource', SolrDatasource);
    }
  };
});
//# sourceMappingURL=datasource.js.map

(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
(window || global).HClust = require('./hclust/src');
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./hclust/src":7}],2:[function(require,module,exports){
'use strict';

function Cluster () {
    this.children = [];
    this.distance = -1;
    this.index = [];
}

/**
 * Creates an array of values where maximum distance smaller than the threshold
 * @param {number} threshold
 * @return {Array <Cluster>}
 */
Cluster.prototype.cut = function (threshold) {
    if (threshold < 0) throw new RangeError('Threshold too small');
    var root = new Cluster();
    root.children = this.children;
    root.distance = this.distance;
    root.index = this.index;
    var list = [root];
    var ans = [];
    while (list.length > 0) {
        var aux = list.shift();
        if (threshold >= aux.distance)
            ans.push(aux);
        else
            list = list.concat(aux.children);
    }
    return ans;
};

/**
 * Merge the leaves in the minimum way to have 'minGroups' number of clusters
 * @param {number} minGroups
 * @return {Cluster}
 */
Cluster.prototype.group = function (minGroups) {
    if (minGroups < 1) throw new RangeError('Number of groups too small');
    var root = new Cluster();
    root.children = this.children;
    root.distance = this.distance;
    root.index = this.index;
    if (minGroups === 1)
        return root;
    var list = [root];
    var aux;
    while (list.length < minGroups && list.length !== 0) {
        aux = list.shift();
        list = list.concat(aux.children);
    }
    if (list.length === 0) throw new RangeError('Number of groups too big');
    for (var i = 0; i < list.length; i++)
        if (list[i].distance === aux.distance) {
            list.concat(list[i].children.slice(1));
            list[i] = list[i].children[0];
        }
    for (var j = 0; j < list.length; j++)
        if (list[j].distance !== 0) {
            var obj = list[j];
            obj.children = obj.index;
        }
    return root;
};

/**
 * Return all data for nodes in this cluster, using 'data' as the original array of node data
 * @param {Array <Object>} data
 * @return {Array <Object>}
 */
Cluster.prototype.nodeData = function (data) {
    var nodeData = [],
        n = this.index.length;
    for (var i = 0; i < n; i++)
        nodeData.push(data[this.index[i].index]);
    return nodeData;
};

/**
 * Exports the cluster object in Newick tree format
 * @param leafNameFunction {function} 
 * @return string
 */
Cluster.prototype.toNewick = function (leafNameFunction, parentDistance) {
    var childNewicks = [];
    if (typeof leafNameFunction !== "function") {
        leafNameFunction = function(leaf) { return leaf.index.toString(); }
    }
    if (!this.children) {
        return leafNameFunction(this) + ':' + (parentDistance || 0);
    } else {
        for (var i = 0; i < this.children.length; i++) {
            childNewicks.push(this.children[i].toNewick(leafNameFunction, this.distance));
        }
        return '(' + childNewicks.join(',') + ')' + 
                (parentDistance === undefined ? ';' : (':' + parentDistance));
    }
};

module.exports = Cluster;

},{}],3:[function(require,module,exports){
'use strict';

var Cluster = require('./Cluster');
var util = require('util');

function ClusterLeaf (index) {
    Cluster.call(this);
    this.index = index;
    this.distance = 0;
    this.children = undefined;
}

util.inherits(ClusterLeaf, Cluster);

/**
 * Returns the data for the node in this ClusterLeaf, using 'data' as the original array of node data
 * @param {Array <Object>} data
 * @return {Array <Object>}
 */
ClusterLeaf.prototype.nodeData = function (data) {
    return [data[this.index]];
};

module.exports = ClusterLeaf;

},{"./Cluster":2,"util":12}],4:[function(require,module,exports){
'use strict';

var euclidean = require('./ml-euclidean-distance');
var ClusterLeaf = require('./ClusterLeaf');
var Cluster = require('./Cluster');
require('./findIndex-polyfill');

/**
 * @param cluster1
 * @param cluster2
 * @param disFun
 * @returns {number}
 */
function simpleLink(cluster1, cluster2, disFun) {
    var m = Infinity;
    for (var i = 0; i < cluster1.length; i++) {
        for (var j = i; j < cluster2.length; j++) {
            var d = disFun(cluster1[i], cluster2[j]);
            m = Math.min(d,m);
        }
    }
    return m;
}

/**
 * @param cluster1
 * @param cluster2
 * @param disFun
 * @returns {number}
 */
function completeLink(cluster1, cluster2, disFun) {
    var m = -1;
    for (var i = 0; i < cluster1.length; i++) {
        for (var j = i; j < cluster2.length; j++) {
            var d = disFun(cluster1[i], cluster2[j]);
            m = Math.max(d,m);
        }
    }
    return m;
}

/**
 * @param cluster1
 * @param cluster2
 * @param disFun
 * @returns {number}
 */
function averageLink(cluster1, cluster2, disFun) {
    var m = 0;
    for (var i = 0; i < cluster1.length; i++) {
        for (var j = 0; j < cluster2.length; j++) {
            m += disFun(cluster1[i], cluster2[j]);
        }
    }
    return m / (cluster1.length * cluster2.length);
}

/**
 * @param cluster1
 * @param cluster2
 * @param disFun
 * @returns {*}
 */
function centroidLink(cluster1, cluster2, disFun) {
    var x1 = 0,
        y1 = 0,
        x2 = 0,
        y2 = 0;
    for (var i = 0; i < cluster1.length; i++) {
        x1 += cluster1[i][0];
        y1 += cluster1[i][1];
    }
    for (var j = 0; j < cluster2.length; j++) {
        x2 += cluster2[j][0];
        y2 += cluster2[j][1];
    }
    x1 /= cluster1.length;
    y1 /= cluster1.length;
    x2 /= cluster2.length;
    y2 /= cluster2.length;
    return disFun([x1,y1], [x2,y2]);
}

/**
 * @param cluster1
 * @param cluster2
 * @param disFun
 * @returns {number}
 */
function wardLink(cluster1, cluster2, disFun) {
    var x1 = 0,
        y1 = 0,
        x2 = 0,
        y2 = 0;
    for (var i = 0; i < cluster1.length; i++) {
        x1 += cluster1[i][0];
        y1 += cluster1[i][1];
    }
    for (var j = 0; j < cluster2.length; j++) {
        x2 += cluster2[j][0];
        y2 += cluster2[j][1];
    }
    x1 /= cluster1.length;
    y1 /= cluster1.length;
    x2 /= cluster2.length;
    y2 /= cluster2.length;
    return disFun([x1,y1], [x2,y2])*cluster1.length*cluster2.length / (cluster1.length+cluster2.length);
}

var defaultOptions = {
    disFunc: euclidean,
    kind: 'single',
    precision: 4
};

/**
 * Continuously merge nodes that have the least dissimilarity
 * @param {Array <Array <number>>} data - Array of points to be clustered
 * @param {json} options
 * @constructor
 */
function agnes(data, options) {
    options = options || {};
    for (var o in defaultOptions)
        if (!(options.hasOwnProperty(o)))
            options[o] = defaultOptions[o];
    var len = data.length;

    // allows to use a string or a given function
    if (typeof options.kind === "string") {
        switch (options.kind) {
            case 'single':
                options.kind = simpleLink;
                break;
            case 'complete':
                options.kind = completeLink;
                break;
            case 'average':
                options.kind = averageLink;
                break;
            case 'centroid':
                options.kind = centroidLink;
                break;
            case 'ward':
                options.kind = wardLink;
                break;
            default:
                throw new RangeError('Unknown kind of similarity');
        }
    }
    else if (typeof options.kind !== "function")
        throw new TypeError('Undefined kind of similarity');

    // Create a list of ClusterLeaf objects; one for every node.
    // This becomes our working list of things we need to agglomeratively cluster.
    var list = [];
    for (var i = 0; i < data.length; i++) {
        list.push(new ClusterLeaf(i));
    }
    var min  = Infinity,
        d = {},
        dis = 0;
  
    // When the working list contains only one item (one Cluster object), we're done.
    while (list.length > 1) {
      
        // Find the minimum distance among all pairs of things that still need to be clustered.
        d = {};
        min = Infinity;
        for (var j = 0; j < list.length; j++) {
            for (var k = j + 1; k < list.length; k++) {
                var fData = list[j].nodeData(data), 
                    sData = list[k].nodeData(data);
                dis = options.kind(fData, sData, options.disFunc).toFixed(options.precision);
                if (dis in d) {
                    d[dis].push([list[j], list[k]]);
                }
                else {
                    d[dis] = [[list[j], list[k]]];
                }
                min = Math.min(dis, min);
            }
        }

        // Create new clusters of ClusterLeaf's and/or Cluster's for the links at this minimum distance.
        var dmin = d[min.toFixed(options.precision)];
        var clustered = [];
        var pair;
        
        // For each pair of ClusterLeaf's/Cluster's linked at the minimum distance, ...
        for (var ii = 0; ii < dmin.length; ii++) {
            pair = dmin[ii];
            // Try to find new clusters that already contain either side of the linked pair.
            var firstAlreadyIn = clustered.findIndex(function(clust) { 
                return clust.indexOf(pair[0]) !== -1;
            });
            var secondAlreadyIn = clustered.findIndex(function(clust) { 
                return clust.indexOf(pair[1]) !== -1; 
            });
            // If both ends are in existing clusters, merge the two clusters (if they are different clusters).
            // If only one end of the link is in a cluster, add the other end of the link to that cluster.
            if (firstAlreadyIn !== -1) {
                if (secondAlreadyIn !== -1) {
                    if (firstAlreadyIn === secondAlreadyIn) { continue; }
                    clustered[firstAlreadyIn] = clustered[firstAlreadyIn].concat(clustered[secondAlreadyIn]);
                    clustered.splice(secondAlreadyIn, 1);
                } else {
                    clustered[firstAlreadyIn].push(pair[1]);
                }
            } else if (secondAlreadyIn !== -1) {
                clustered[secondAlreadyIn].push(pair[0]);
            } else {
                // If neither side is in a cluster, make a new cluster out of this pair.
                clustered.push(pair.concat());
            }
        }

        // Create a new Cluster object for the clusters we just created
        for (var ii = 0; ii < clustered.length; ii++) {
            var obj = new Cluster();
            obj.children = clustered[ii].concat();
            obj.distance = min;
            obj.index = [];
            // Glue the indexes for all children together into one big index for this Cluster.
            // The .index should always list all nodes that are underneath this particular Cluster.
            for (var jj = 0; jj < clustered[ii].length; jj++) {
                if (clustered[ii][jj] instanceof ClusterLeaf)
                    obj.index.push(clustered[ii][jj]);
                else
                    obj.index = obj.index.concat(clustered[ii][jj].index);
                
                // Delete the newly clustered ClusterLeaf/Cluster from the working list of things that
                // still need to be clustered
                list.splice((list.indexOf(clustered[ii][jj])), 1);
            }
            list.push(obj);
        }
    }
    return list[0];
}

module.exports = agnes;
},{"./Cluster":2,"./ClusterLeaf":3,"./findIndex-polyfill":6,"./ml-euclidean-distance":8}],5:[function(require,module,exports){
'use strict';

var euclidean = require('./ml-euclidean-distance');
var ClusterLeaf = require('./ClusterLeaf');
var Cluster = require('./Cluster');

/**
 * @param {Array <Array <number>>} cluster1
 * @param {Array <Array <number>>} cluster2
 * @param {function} disFun
 * @returns {number}
 */
function simpleLink(cluster1, cluster2, disFun) {
    var m = 10e100;
    for (var i = 0; i < cluster1.length; i++)
        for (var j = i; j < cluster2.length; j++) {
            var d = disFun(cluster1[i], cluster2[j]);
            m = Math.min(d,m);
        }
    return m;
}

/**
 * @param {Array <Array <number>>} cluster1
 * @param {Array <Array <number>>} cluster2
 * @param {function} disFun
 * @returns {number}
 */
function completeLink(cluster1, cluster2, disFun) {
    var m = -1;
    for (var i = 0; i < cluster1.length; i++)
        for (var j = i; j < cluster2.length; j++) {
            var d = disFun(cluster1[i], cluster2[j]);
            m = Math.max(d,m);
        }
    return m;
}

/**
 * @param {Array <Array <number>>} cluster1
 * @param {Array <Array <number>>} cluster2
 * @param {function} disFun
 * @returns {number}
 */
function averageLink(cluster1, cluster2, disFun) {
    var m = 0;
    for (var i = 0; i < cluster1.length; i++)
        for (var j = 0; j < cluster2.length; j++)
            m += disFun(cluster1[i], cluster2[j]);
    return m / (cluster1.length * cluster2.length);
}

/**
 * @param {Array <Array <number>>} cluster1
 * @param {Array <Array <number>>} cluster2
 * @param {function} disFun
 * @returns {number}
 */
function centroidLink(cluster1, cluster2, disFun) {
    var x1 = 0,
        y1 = 0,
        x2 = 0,
        y2 = 0;
    for (var i = 0; i < cluster1.length; i++) {
        x1 += cluster1[i][0];
        y1 += cluster1[i][1];
    }
    for (var j = 0; j < cluster2.length; j++) {
        x2 += cluster2[j][0];
        y2 += cluster2[j][1];
    }
    x1 /= cluster1.length;
    y1 /= cluster1.length;
    x2 /= cluster2.length;
    y2 /= cluster2.length;
    return disFun([x1,y1], [x2,y2]);
}

/**
 * @param {Array <Array <number>>} cluster1
 * @param {Array <Array <number>>} cluster2
 * @param {function} disFun
 * @returns {number}
 */
function wardLink(cluster1, cluster2, disFun) {
    var x1 = 0,
        y1 = 0,
        x2 = 0,
        y2 = 0;
    for (var i = 0; i < cluster1.length; i++) {
        x1 += cluster1[i][0];
        y1 += cluster1[i][1];
    }
    for (var j = 0; j < cluster2.length; j++) {
        x2 += cluster2[j][0];
        y2 += cluster2[j][1];
    }
    x1 /= cluster1.length;
    y1 /= cluster1.length;
    x2 /= cluster2.length;
    y2 /= cluster2.length;
    return disFun([x1,y1], [x2,y2])*cluster1.length*cluster2.length / (cluster1.length+cluster2.length);
}

/**
 * Returns the most distant point and his distance
 * @param {Array <Array <number>>} splitting - Clusters to split
 * @param {Array <Array <number>>} data - Original data
 * @param {function} disFun - Distance function
 * @returns {{d: number, p: number}} - d: maximum difference between points, p: the point more distant
 */
function diff(splitting, data, disFun) {
    var ans = {
        d:0,
        p:0
    };

    var Ci = new Array(splitting[0].length);
    for (var e = 0; e < splitting[0].length; e++)
        Ci[e] = data[splitting[0][e]];
    var Cj = new Array(splitting[1].length);
    for (var f = 0; f < splitting[1].length; f++)
        Cj[f] = data[splitting[1][f]];

    var dist, ndist;
    for (var i = 0; i < Ci.length; i++) {
        dist = 0;
        for (var j = 0; j < Ci.length; j++)
            if (i !== j)
                dist += disFun(Ci[i], Ci[j]);
        dist /= (Ci.length - 1);
        ndist = 0;
        for (var k = 0; k < Cj.length; k++)
            ndist += disFun(Ci[i], Cj[k]);
        ndist /= Cj.length;
        if ((dist - ndist) > ans.d) {
            ans.d = (dist - ndist);
            ans.p = i;
        }
    }
    return ans;
}

var defaultOptions = {
    dist: euclidean,
    kind: 'single'
};

/**
 * Intra-cluster distance
 * @param {Array} index
 * @param {Array} data
 * @param {function} disFun
 * @returns {number}
 */
function intrDist(index, data, disFun) {
    var dist = 0,
        count = 0;
    for (var i = 0; i < index.length; i++)
        for (var j = i; j < index.length; j++) {
            dist += disFun(data[index[i].index], data[index[j].index]);
            count++
        }
    return dist / count;
}

/**
 * Splits the higher level clusters
 * @param {Array <Array <number>>} data - Array of points to be clustered
 * @param {json} options
 * @constructor
 */
function diana(data, options) {
    options = options || {};
    for (var o in defaultOptions)
        if (!(options.hasOwnProperty(o)))
            options[o] = defaultOptions[o];
    if (typeof options.kind === "string") {
        switch (options.kind) {
            case 'single':
                options.kind = simpleLink;
                break;
            case 'complete':
                options.kind = completeLink;
                break;
            case 'average':
                options.kind = averageLink;
                break;
            case 'centroid':
                options.kind = centroidLink;
                break;
            case 'ward':
                options.kind = wardLink;
                break;
            default:
                throw new RangeError('Unknown kind of similarity');
        }
    }
    else if (typeof options.kind !== "function")
        throw new TypeError('Undefined kind of similarity');
    var tree = new Cluster();
    tree.children = new Array(data.length);
    tree.index = new Array(data.length);
    for (var ind = 0; ind < data.length; ind++) {
        tree.children[ind] = new ClusterLeaf(ind);
        tree.index[ind] = new ClusterLeaf(ind);
    }

    tree.distance = intrDist(tree.index, data, options.dist);
    var m, M, clId,
        dist, rebel;
    var list = [tree];
    while (list.length > 0) {
        M = 0;
        clId = 0;
        for (var i = 0; i < list.length; i++) {
            m = 0;
            for (var j = 0; j < list[i].length; j++) {
                for (var l = (j + 1); l < list[i].length; l++) {
                    m = Math.max(options.dist(data[list[i].index[j].index], data[list[i].index[l].index]), m);
                }
            }
            if (m > M) {
                M = m;
                clId = i;
            }
        }
        M = 0;
        if (list[clId].index.length === 2) {
            list[clId].children = [list[clId].index[0], list[clId].index[1]];
            list[clId].distance = options.dist(data[list[clId].index[0].index], data[list[clId].index[1].index]);
        }
        else if (list[clId].index.length === 3) {
            list[clId].children = [list[clId].index[0], list[clId].index[1], list[clId].index[2]];
            var d = [
                options.dist(data[list[clId].index[0].index], data[list[clId].index[1].index]),
                options.dist(data[list[clId].index[1].index], data[list[clId].index[2].index])
            ];
            list[clId].distance = (d[0] + d[1]) / 2;
        }
        else {
            var C = new Cluster();
            var sG = new Cluster();
            var splitting = [new Array(list[clId].index.length), []];
            for (var spl = 0; spl < splitting[0].length; spl++)
                splitting[0][spl] = spl;
            for (var ii = 0; ii < splitting[0].length; ii++) {
                dist = 0;
                for (var jj = 0; jj < splitting[0].length; jj++)
                    if (ii !== jj)
                        dist += options.dist(data[list[clId].index[splitting[0][jj]].index], data[list[clId].index[splitting[0][ii]].index]);
                dist /= (splitting[0].length - 1);
                if (dist > M) {
                    M = dist;
                    rebel = ii;
                }
            }
            splitting[1] = [rebel];
            splitting[0].splice(rebel, 1);
            dist = diff(splitting, data, options.dist);
            while (dist.d > 0) {
                splitting[1].push(splitting[0][dist.p]);
                splitting[0].splice(dist.p, 1);
                dist = diff(splitting, data, options.dist);
            }
            var fData = new Array(splitting[0].length);
            C.index = new Array(splitting[0].length);
            for (var e = 0; e < fData.length; e++) {
                fData[e] = data[list[clId].index[splitting[0][e]].index];
                C.index[e] = list[clId].index[splitting[0][e]];
                C.children[e] = list[clId].index[splitting[0][e]];
            }
            var sData = new Array(splitting[1].length);
            sG.index = new Array(splitting[1].length);
            for (var f = 0; f < sData.length; f++) {
                sData[f] = data[list[clId].index[splitting[1][f]].index];
                sG.index[f] = list[clId].index[splitting[1][f]];
                sG.children[f] = list[clId].index[splitting[1][f]];
            }
            C.distance = intrDist(C.index, data, options.dist);
            sG.distance = intrDist(sG.index, data, options.dist);
            list.push(C);
            list.push(sG);
            list[clId].children = [C, sG];
        }
        list.splice(clId, 1);
    }
    return tree;
}

module.exports = diana;
},{"./Cluster":2,"./ClusterLeaf":3,"./ml-euclidean-distance":8}],6:[function(require,module,exports){
'use strict';

if (!Array.prototype.findIndex) {
  Object.defineProperty(Array.prototype, 'findIndex', {
    value: function(predicate) {
     // 1. Let O be ? ToObject(this value).
      if (this == null) {
        throw new TypeError('"this" is null or not defined');
      }

      var o = Object(this);

      // 2. Let len be ? ToLength(? Get(O, "length")).
      var len = o.length >>> 0;

      // 3. If IsCallable(predicate) is false, throw a TypeError exception.
      if (typeof predicate !== 'function') {
        throw new TypeError('predicate must be a function');
      }

      // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
      var thisArg = arguments[1];

      // 5. Let k be 0.
      var k = 0;

      // 6. Repeat, while k < len
      while (k < len) {
        // a. Let Pk be ! ToString(k).
        // b. Let kValue be ? Get(O, Pk).
        // c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
        // d. If testResult is true, return k.
        var kValue = o[k];
        if (predicate.call(thisArg, kValue, k, o)) {
          return k;
        }
        // e. Increase k by 1.
        k++;
      }

      // 7. Return -1.
      return -1;
    },
    configurable: true,
    writable: true
  });
}
},{}],7:[function(require,module,exports){
exports.agnes = require('./agnes');
exports.diana = require('./diana');
//exports.birch = require('./birch');
//exports.cure = require('./cure');
//exports.chameleon = require('./chameleon');
},{"./agnes":4,"./diana":5}],8:[function(require,module,exports){
'use strict';

// ml-euclidean-distance
// From: https://github.com/mljs/euclidean-distance
// License: MIT

function squaredEuclidean(p, q) {
    var d = 0;
    for (var i = 0; i < p.length; i++) {
        d += (p[i] - q[i]) * (p[i] - q[i]);
    }
    return d;
}

function euclidean(p, q) {
    return Math.sqrt(squaredEuclidean(p, q));
}

module.exports = euclidean;
euclidean.squared = squaredEuclidean;
},{}],9:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],10:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],11:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],12:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./support/isBuffer":11,"_process":10,"inherits":9}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImpzL2hjbHVzdC5qcyIsImpzL2hjbHVzdC9zcmMvQ2x1c3Rlci5qcyIsImpzL2hjbHVzdC9zcmMvQ2x1c3RlckxlYWYuanMiLCJqcy9oY2x1c3Qvc3JjL2FnbmVzLmpzIiwianMvaGNsdXN0L3NyYy9kaWFuYS5qcyIsImpzL2hjbHVzdC9zcmMvZmluZEluZGV4LXBvbHlmaWxsLmpzIiwianMvaGNsdXN0L3NyYy9pbmRleC5qcyIsImpzL2hjbHVzdC9zcmMvbWwtZXVjbGlkZWFuLWRpc3RhbmNlLmpzIiwiLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5oZXJpdHMvaW5oZXJpdHNfYnJvd3Nlci5qcyIsIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3V0aWwvc3VwcG9ydC9pc0J1ZmZlckJyb3dzZXIuanMiLCIuLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3V0aWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0FDQUE7Ozs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIod2luZG93IHx8IGdsb2JhbCkuSENsdXN0ID0gcmVxdWlyZSgnLi9oY2x1c3Qvc3JjJyk7IiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBDbHVzdGVyICgpIHtcbiAgICB0aGlzLmNoaWxkcmVuID0gW107XG4gICAgdGhpcy5kaXN0YW5jZSA9IC0xO1xuICAgIHRoaXMuaW5kZXggPSBbXTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHZhbHVlcyB3aGVyZSBtYXhpbXVtIGRpc3RhbmNlIHNtYWxsZXIgdGhhbiB0aGUgdGhyZXNob2xkXG4gKiBAcGFyYW0ge251bWJlcn0gdGhyZXNob2xkXG4gKiBAcmV0dXJuIHtBcnJheSA8Q2x1c3Rlcj59XG4gKi9cbkNsdXN0ZXIucHJvdG90eXBlLmN1dCA9IGZ1bmN0aW9uICh0aHJlc2hvbGQpIHtcbiAgICBpZiAodGhyZXNob2xkIDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RocmVzaG9sZCB0b28gc21hbGwnKTtcbiAgICB2YXIgcm9vdCA9IG5ldyBDbHVzdGVyKCk7XG4gICAgcm9vdC5jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW47XG4gICAgcm9vdC5kaXN0YW5jZSA9IHRoaXMuZGlzdGFuY2U7XG4gICAgcm9vdC5pbmRleCA9IHRoaXMuaW5kZXg7XG4gICAgdmFyIGxpc3QgPSBbcm9vdF07XG4gICAgdmFyIGFucyA9IFtdO1xuICAgIHdoaWxlIChsaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIGF1eCA9IGxpc3Quc2hpZnQoKTtcbiAgICAgICAgaWYgKHRocmVzaG9sZCA+PSBhdXguZGlzdGFuY2UpXG4gICAgICAgICAgICBhbnMucHVzaChhdXgpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBsaXN0ID0gbGlzdC5jb25jYXQoYXV4LmNoaWxkcmVuKTtcbiAgICB9XG4gICAgcmV0dXJuIGFucztcbn07XG5cbi8qKlxuICogTWVyZ2UgdGhlIGxlYXZlcyBpbiB0aGUgbWluaW11bSB3YXkgdG8gaGF2ZSAnbWluR3JvdXBzJyBudW1iZXIgb2YgY2x1c3RlcnNcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5Hcm91cHNcbiAqIEByZXR1cm4ge0NsdXN0ZXJ9XG4gKi9cbkNsdXN0ZXIucHJvdG90eXBlLmdyb3VwID0gZnVuY3Rpb24gKG1pbkdyb3Vwcykge1xuICAgIGlmIChtaW5Hcm91cHMgPCAxKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignTnVtYmVyIG9mIGdyb3VwcyB0b28gc21hbGwnKTtcbiAgICB2YXIgcm9vdCA9IG5ldyBDbHVzdGVyKCk7XG4gICAgcm9vdC5jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW47XG4gICAgcm9vdC5kaXN0YW5jZSA9IHRoaXMuZGlzdGFuY2U7XG4gICAgcm9vdC5pbmRleCA9IHRoaXMuaW5kZXg7XG4gICAgaWYgKG1pbkdyb3VwcyA9PT0gMSlcbiAgICAgICAgcmV0dXJuIHJvb3Q7XG4gICAgdmFyIGxpc3QgPSBbcm9vdF07XG4gICAgdmFyIGF1eDtcbiAgICB3aGlsZSAobGlzdC5sZW5ndGggPCBtaW5Hcm91cHMgJiYgbGlzdC5sZW5ndGggIT09IDApIHtcbiAgICAgICAgYXV4ID0gbGlzdC5zaGlmdCgpO1xuICAgICAgICBsaXN0ID0gbGlzdC5jb25jYXQoYXV4LmNoaWxkcmVuKTtcbiAgICB9XG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignTnVtYmVyIG9mIGdyb3VwcyB0b28gYmlnJyk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKVxuICAgICAgICBpZiAobGlzdFtpXS5kaXN0YW5jZSA9PT0gYXV4LmRpc3RhbmNlKSB7XG4gICAgICAgICAgICBsaXN0LmNvbmNhdChsaXN0W2ldLmNoaWxkcmVuLnNsaWNlKDEpKTtcbiAgICAgICAgICAgIGxpc3RbaV0gPSBsaXN0W2ldLmNoaWxkcmVuWzBdO1xuICAgICAgICB9XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBsaXN0Lmxlbmd0aDsgaisrKVxuICAgICAgICBpZiAobGlzdFtqXS5kaXN0YW5jZSAhPT0gMCkge1xuICAgICAgICAgICAgdmFyIG9iaiA9IGxpc3Rbal07XG4gICAgICAgICAgICBvYmouY2hpbGRyZW4gPSBvYmouaW5kZXg7XG4gICAgICAgIH1cbiAgICByZXR1cm4gcm9vdDtcbn07XG5cbi8qKlxuICogUmV0dXJuIGFsbCBkYXRhIGZvciBub2RlcyBpbiB0aGlzIGNsdXN0ZXIsIHVzaW5nICdkYXRhJyBhcyB0aGUgb3JpZ2luYWwgYXJyYXkgb2Ygbm9kZSBkYXRhXG4gKiBAcGFyYW0ge0FycmF5IDxPYmplY3Q+fSBkYXRhXG4gKiBAcmV0dXJuIHtBcnJheSA8T2JqZWN0Pn1cbiAqL1xuQ2x1c3Rlci5wcm90b3R5cGUubm9kZURhdGEgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgIHZhciBub2RlRGF0YSA9IFtdLFxuICAgICAgICBuID0gdGhpcy5pbmRleC5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspXG4gICAgICAgIG5vZGVEYXRhLnB1c2goZGF0YVt0aGlzLmluZGV4W2ldLmluZGV4XSk7XG4gICAgcmV0dXJuIG5vZGVEYXRhO1xufTtcblxuLyoqXG4gKiBFeHBvcnRzIHRoZSBjbHVzdGVyIG9iamVjdCBpbiBOZXdpY2sgdHJlZSBmb3JtYXRcbiAqIEBwYXJhbSBsZWFmTmFtZUZ1bmN0aW9uIHtmdW5jdGlvbn0gXG4gKiBAcmV0dXJuIHN0cmluZ1xuICovXG5DbHVzdGVyLnByb3RvdHlwZS50b05ld2ljayA9IGZ1bmN0aW9uIChsZWFmTmFtZUZ1bmN0aW9uLCBwYXJlbnREaXN0YW5jZSkge1xuICAgIHZhciBjaGlsZE5ld2lja3MgPSBbXTtcbiAgICBpZiAodHlwZW9mIGxlYWZOYW1lRnVuY3Rpb24gIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICBsZWFmTmFtZUZ1bmN0aW9uID0gZnVuY3Rpb24obGVhZikgeyByZXR1cm4gbGVhZi5pbmRleC50b1N0cmluZygpOyB9XG4gICAgfVxuICAgIGlmICghdGhpcy5jaGlsZHJlbikge1xuICAgICAgICByZXR1cm4gbGVhZk5hbWVGdW5jdGlvbih0aGlzKSArICc6JyArIChwYXJlbnREaXN0YW5jZSB8fCAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNoaWxkTmV3aWNrcy5wdXNoKHRoaXMuY2hpbGRyZW5baV0udG9OZXdpY2sobGVhZk5hbWVGdW5jdGlvbiwgdGhpcy5kaXN0YW5jZSkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAnKCcgKyBjaGlsZE5ld2lja3Muam9pbignLCcpICsgJyknICsgXG4gICAgICAgICAgICAgICAgKHBhcmVudERpc3RhbmNlID09PSB1bmRlZmluZWQgPyAnOycgOiAoJzonICsgcGFyZW50RGlzdGFuY2UpKTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENsdXN0ZXI7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBDbHVzdGVyID0gcmVxdWlyZSgnLi9DbHVzdGVyJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuZnVuY3Rpb24gQ2x1c3RlckxlYWYgKGluZGV4KSB7XG4gICAgQ2x1c3Rlci5jYWxsKHRoaXMpO1xuICAgIHRoaXMuaW5kZXggPSBpbmRleDtcbiAgICB0aGlzLmRpc3RhbmNlID0gMDtcbiAgICB0aGlzLmNoaWxkcmVuID0gdW5kZWZpbmVkO1xufVxuXG51dGlsLmluaGVyaXRzKENsdXN0ZXJMZWFmLCBDbHVzdGVyKTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkYXRhIGZvciB0aGUgbm9kZSBpbiB0aGlzIENsdXN0ZXJMZWFmLCB1c2luZyAnZGF0YScgYXMgdGhlIG9yaWdpbmFsIGFycmF5IG9mIG5vZGUgZGF0YVxuICogQHBhcmFtIHtBcnJheSA8T2JqZWN0Pn0gZGF0YVxuICogQHJldHVybiB7QXJyYXkgPE9iamVjdD59XG4gKi9cbkNsdXN0ZXJMZWFmLnByb3RvdHlwZS5ub2RlRGF0YSA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgcmV0dXJuIFtkYXRhW3RoaXMuaW5kZXhdXTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2x1c3RlckxlYWY7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBldWNsaWRlYW4gPSByZXF1aXJlKCcuL21sLWV1Y2xpZGVhbi1kaXN0YW5jZScpO1xudmFyIENsdXN0ZXJMZWFmID0gcmVxdWlyZSgnLi9DbHVzdGVyTGVhZicpO1xudmFyIENsdXN0ZXIgPSByZXF1aXJlKCcuL0NsdXN0ZXInKTtcbnJlcXVpcmUoJy4vZmluZEluZGV4LXBvbHlmaWxsJyk7XG5cbi8qKlxuICogQHBhcmFtIGNsdXN0ZXIxXG4gKiBAcGFyYW0gY2x1c3RlcjJcbiAqIEBwYXJhbSBkaXNGdW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIHNpbXBsZUxpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgbSA9IEluZmluaXR5O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3RlcjEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IGk7IGogPCBjbHVzdGVyMi5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgdmFyIGQgPSBkaXNGdW4oY2x1c3RlcjFbaV0sIGNsdXN0ZXIyW2pdKTtcbiAgICAgICAgICAgIG0gPSBNYXRoLm1pbihkLG0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBtO1xufVxuXG4vKipcbiAqIEBwYXJhbSBjbHVzdGVyMVxuICogQHBhcmFtIGNsdXN0ZXIyXG4gKiBAcGFyYW0gZGlzRnVuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiBjb21wbGV0ZUxpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgbSA9IC0xO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3RlcjEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IGk7IGogPCBjbHVzdGVyMi5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgdmFyIGQgPSBkaXNGdW4oY2x1c3RlcjFbaV0sIGNsdXN0ZXIyW2pdKTtcbiAgICAgICAgICAgIG0gPSBNYXRoLm1heChkLG0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBtO1xufVxuXG4vKipcbiAqIEBwYXJhbSBjbHVzdGVyMVxuICogQHBhcmFtIGNsdXN0ZXIyXG4gKiBAcGFyYW0gZGlzRnVuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiBhdmVyYWdlTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciBtID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsdXN0ZXIxLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY2x1c3RlcjIubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIG0gKz0gZGlzRnVuKGNsdXN0ZXIxW2ldLCBjbHVzdGVyMltqXSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG0gLyAoY2x1c3RlcjEubGVuZ3RoICogY2x1c3RlcjIubGVuZ3RoKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gY2x1c3RlcjFcbiAqIEBwYXJhbSBjbHVzdGVyMlxuICogQHBhcmFtIGRpc0Z1blxuICogQHJldHVybnMgeyp9XG4gKi9cbmZ1bmN0aW9uIGNlbnRyb2lkTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciB4MSA9IDAsXG4gICAgICAgIHkxID0gMCxcbiAgICAgICAgeDIgPSAwLFxuICAgICAgICB5MiA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKykge1xuICAgICAgICB4MSArPSBjbHVzdGVyMVtpXVswXTtcbiAgICAgICAgeTEgKz0gY2x1c3RlcjFbaV1bMV07XG4gICAgfVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgY2x1c3RlcjIubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgeDIgKz0gY2x1c3RlcjJbal1bMF07XG4gICAgICAgIHkyICs9IGNsdXN0ZXIyW2pdWzFdO1xuICAgIH1cbiAgICB4MSAvPSBjbHVzdGVyMS5sZW5ndGg7XG4gICAgeTEgLz0gY2x1c3RlcjEubGVuZ3RoO1xuICAgIHgyIC89IGNsdXN0ZXIyLmxlbmd0aDtcbiAgICB5MiAvPSBjbHVzdGVyMi5sZW5ndGg7XG4gICAgcmV0dXJuIGRpc0Z1bihbeDEseTFdLCBbeDIseTJdKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gY2x1c3RlcjFcbiAqIEBwYXJhbSBjbHVzdGVyMlxuICogQHBhcmFtIGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gd2FyZExpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgeDEgPSAwLFxuICAgICAgICB5MSA9IDAsXG4gICAgICAgIHgyID0gMCxcbiAgICAgICAgeTIgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3RlcjEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgeDEgKz0gY2x1c3RlcjFbaV1bMF07XG4gICAgICAgIHkxICs9IGNsdXN0ZXIxW2ldWzFdO1xuICAgIH1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIHgyICs9IGNsdXN0ZXIyW2pdWzBdO1xuICAgICAgICB5MiArPSBjbHVzdGVyMltqXVsxXTtcbiAgICB9XG4gICAgeDEgLz0gY2x1c3RlcjEubGVuZ3RoO1xuICAgIHkxIC89IGNsdXN0ZXIxLmxlbmd0aDtcbiAgICB4MiAvPSBjbHVzdGVyMi5sZW5ndGg7XG4gICAgeTIgLz0gY2x1c3RlcjIubGVuZ3RoO1xuICAgIHJldHVybiBkaXNGdW4oW3gxLHkxXSwgW3gyLHkyXSkqY2x1c3RlcjEubGVuZ3RoKmNsdXN0ZXIyLmxlbmd0aCAvIChjbHVzdGVyMS5sZW5ndGgrY2x1c3RlcjIubGVuZ3RoKTtcbn1cblxudmFyIGRlZmF1bHRPcHRpb25zID0ge1xuICAgIGRpc0Z1bmM6IGV1Y2xpZGVhbixcbiAgICBraW5kOiAnc2luZ2xlJyxcbiAgICBwcmVjaXNpb246IDRcbn07XG5cbi8qKlxuICogQ29udGludW91c2x5IG1lcmdlIG5vZGVzIHRoYXQgaGF2ZSB0aGUgbGVhc3QgZGlzc2ltaWxhcml0eVxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBkYXRhIC0gQXJyYXkgb2YgcG9pbnRzIHRvIGJlIGNsdXN0ZXJlZFxuICogQHBhcmFtIHtqc29ufSBvcHRpb25zXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gYWduZXMoZGF0YSwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIGZvciAodmFyIG8gaW4gZGVmYXVsdE9wdGlvbnMpXG4gICAgICAgIGlmICghKG9wdGlvbnMuaGFzT3duUHJvcGVydHkobykpKVxuICAgICAgICAgICAgb3B0aW9uc1tvXSA9IGRlZmF1bHRPcHRpb25zW29dO1xuICAgIHZhciBsZW4gPSBkYXRhLmxlbmd0aDtcblxuICAgIC8vIGFsbG93cyB0byB1c2UgYSBzdHJpbmcgb3IgYSBnaXZlbiBmdW5jdGlvblxuICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5raW5kID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHN3aXRjaCAob3B0aW9ucy5raW5kKSB7XG4gICAgICAgICAgICBjYXNlICdzaW5nbGUnOlxuICAgICAgICAgICAgICAgIG9wdGlvbnMua2luZCA9IHNpbXBsZUxpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdjb21wbGV0ZSc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gY29tcGxldGVMaW5rO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnYXZlcmFnZSc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gYXZlcmFnZUxpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdjZW50cm9pZCc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gY2VudHJvaWRMaW5rO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnd2FyZCc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gd2FyZExpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdVbmtub3duIGtpbmQgb2Ygc2ltaWxhcml0eScpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zLmtpbmQgIT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5kZWZpbmVkIGtpbmQgb2Ygc2ltaWxhcml0eScpO1xuXG4gICAgLy8gQ3JlYXRlIGEgbGlzdCBvZiBDbHVzdGVyTGVhZiBvYmplY3RzOyBvbmUgZm9yIGV2ZXJ5IG5vZGUuXG4gICAgLy8gVGhpcyBiZWNvbWVzIG91ciB3b3JraW5nIGxpc3Qgb2YgdGhpbmdzIHdlIG5lZWQgdG8gYWdnbG9tZXJhdGl2ZWx5IGNsdXN0ZXIuXG4gICAgdmFyIGxpc3QgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgbGlzdC5wdXNoKG5ldyBDbHVzdGVyTGVhZihpKSk7XG4gICAgfVxuICAgIHZhciBtaW4gID0gSW5maW5pdHksXG4gICAgICAgIGQgPSB7fSxcbiAgICAgICAgZGlzID0gMDtcbiAgXG4gICAgLy8gV2hlbiB0aGUgd29ya2luZyBsaXN0IGNvbnRhaW5zIG9ubHkgb25lIGl0ZW0gKG9uZSBDbHVzdGVyIG9iamVjdCksIHdlJ3JlIGRvbmUuXG4gICAgd2hpbGUgKGxpc3QubGVuZ3RoID4gMSkge1xuICAgICAgXG4gICAgICAgIC8vIEZpbmQgdGhlIG1pbmltdW0gZGlzdGFuY2UgYW1vbmcgYWxsIHBhaXJzIG9mIHRoaW5ncyB0aGF0IHN0aWxsIG5lZWQgdG8gYmUgY2x1c3RlcmVkLlxuICAgICAgICBkID0ge307XG4gICAgICAgIG1pbiA9IEluZmluaXR5O1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGxpc3QubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGsgPSBqICsgMTsgayA8IGxpc3QubGVuZ3RoOyBrKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgZkRhdGEgPSBsaXN0W2pdLm5vZGVEYXRhKGRhdGEpLCBcbiAgICAgICAgICAgICAgICAgICAgc0RhdGEgPSBsaXN0W2tdLm5vZGVEYXRhKGRhdGEpO1xuICAgICAgICAgICAgICAgIGRpcyA9IG9wdGlvbnMua2luZChmRGF0YSwgc0RhdGEsIG9wdGlvbnMuZGlzRnVuYykudG9GaXhlZChvcHRpb25zLnByZWNpc2lvbik7XG4gICAgICAgICAgICAgICAgaWYgKGRpcyBpbiBkKSB7XG4gICAgICAgICAgICAgICAgICAgIGRbZGlzXS5wdXNoKFtsaXN0W2pdLCBsaXN0W2tdXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBkW2Rpc10gPSBbW2xpc3Rbal0sIGxpc3Rba11dXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbWluID0gTWF0aC5taW4oZGlzLCBtaW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ3JlYXRlIG5ldyBjbHVzdGVycyBvZiBDbHVzdGVyTGVhZidzIGFuZC9vciBDbHVzdGVyJ3MgZm9yIHRoZSBsaW5rcyBhdCB0aGlzIG1pbmltdW0gZGlzdGFuY2UuXG4gICAgICAgIHZhciBkbWluID0gZFttaW4udG9GaXhlZChvcHRpb25zLnByZWNpc2lvbildO1xuICAgICAgICB2YXIgY2x1c3RlcmVkID0gW107XG4gICAgICAgIHZhciBwYWlyO1xuICAgICAgICBcbiAgICAgICAgLy8gRm9yIGVhY2ggcGFpciBvZiBDbHVzdGVyTGVhZidzL0NsdXN0ZXIncyBsaW5rZWQgYXQgdGhlIG1pbmltdW0gZGlzdGFuY2UsIC4uLlxuICAgICAgICBmb3IgKHZhciBpaSA9IDA7IGlpIDwgZG1pbi5sZW5ndGg7IGlpKyspIHtcbiAgICAgICAgICAgIHBhaXIgPSBkbWluW2lpXTtcbiAgICAgICAgICAgIC8vIFRyeSB0byBmaW5kIG5ldyBjbHVzdGVycyB0aGF0IGFscmVhZHkgY29udGFpbiBlaXRoZXIgc2lkZSBvZiB0aGUgbGlua2VkIHBhaXIuXG4gICAgICAgICAgICB2YXIgZmlyc3RBbHJlYWR5SW4gPSBjbHVzdGVyZWQuZmluZEluZGV4KGZ1bmN0aW9uKGNsdXN0KSB7IFxuICAgICAgICAgICAgICAgIHJldHVybiBjbHVzdC5pbmRleE9mKHBhaXJbMF0pICE9PSAtMTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdmFyIHNlY29uZEFscmVhZHlJbiA9IGNsdXN0ZXJlZC5maW5kSW5kZXgoZnVuY3Rpb24oY2x1c3QpIHsgXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNsdXN0LmluZGV4T2YocGFpclsxXSkgIT09IC0xOyBcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgLy8gSWYgYm90aCBlbmRzIGFyZSBpbiBleGlzdGluZyBjbHVzdGVycywgbWVyZ2UgdGhlIHR3byBjbHVzdGVycyAoaWYgdGhleSBhcmUgZGlmZmVyZW50IGNsdXN0ZXJzKS5cbiAgICAgICAgICAgIC8vIElmIG9ubHkgb25lIGVuZCBvZiB0aGUgbGluayBpcyBpbiBhIGNsdXN0ZXIsIGFkZCB0aGUgb3RoZXIgZW5kIG9mIHRoZSBsaW5rIHRvIHRoYXQgY2x1c3Rlci5cbiAgICAgICAgICAgIGlmIChmaXJzdEFscmVhZHlJbiAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBpZiAoc2Vjb25kQWxyZWFkeUluICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZmlyc3RBbHJlYWR5SW4gPT09IHNlY29uZEFscmVhZHlJbikgeyBjb250aW51ZTsgfVxuICAgICAgICAgICAgICAgICAgICBjbHVzdGVyZWRbZmlyc3RBbHJlYWR5SW5dID0gY2x1c3RlcmVkW2ZpcnN0QWxyZWFkeUluXS5jb25jYXQoY2x1c3RlcmVkW3NlY29uZEFscmVhZHlJbl0pO1xuICAgICAgICAgICAgICAgICAgICBjbHVzdGVyZWQuc3BsaWNlKHNlY29uZEFscmVhZHlJbiwgMSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY2x1c3RlcmVkW2ZpcnN0QWxyZWFkeUluXS5wdXNoKHBhaXJbMV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2Vjb25kQWxyZWFkeUluICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGNsdXN0ZXJlZFtzZWNvbmRBbHJlYWR5SW5dLnB1c2gocGFpclswXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIElmIG5laXRoZXIgc2lkZSBpcyBpbiBhIGNsdXN0ZXIsIG1ha2UgYSBuZXcgY2x1c3RlciBvdXQgb2YgdGhpcyBwYWlyLlxuICAgICAgICAgICAgICAgIGNsdXN0ZXJlZC5wdXNoKHBhaXIuY29uY2F0KCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ3JlYXRlIGEgbmV3IENsdXN0ZXIgb2JqZWN0IGZvciB0aGUgY2x1c3RlcnMgd2UganVzdCBjcmVhdGVkXG4gICAgICAgIGZvciAodmFyIGlpID0gMDsgaWkgPCBjbHVzdGVyZWQubGVuZ3RoOyBpaSsrKSB7XG4gICAgICAgICAgICB2YXIgb2JqID0gbmV3IENsdXN0ZXIoKTtcbiAgICAgICAgICAgIG9iai5jaGlsZHJlbiA9IGNsdXN0ZXJlZFtpaV0uY29uY2F0KCk7XG4gICAgICAgICAgICBvYmouZGlzdGFuY2UgPSBtaW47XG4gICAgICAgICAgICBvYmouaW5kZXggPSBbXTtcbiAgICAgICAgICAgIC8vIEdsdWUgdGhlIGluZGV4ZXMgZm9yIGFsbCBjaGlsZHJlbiB0b2dldGhlciBpbnRvIG9uZSBiaWcgaW5kZXggZm9yIHRoaXMgQ2x1c3Rlci5cbiAgICAgICAgICAgIC8vIFRoZSAuaW5kZXggc2hvdWxkIGFsd2F5cyBsaXN0IGFsbCBub2RlcyB0aGF0IGFyZSB1bmRlcm5lYXRoIHRoaXMgcGFydGljdWxhciBDbHVzdGVyLlxuICAgICAgICAgICAgZm9yICh2YXIgamogPSAwOyBqaiA8IGNsdXN0ZXJlZFtpaV0ubGVuZ3RoOyBqaisrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNsdXN0ZXJlZFtpaV1bampdIGluc3RhbmNlb2YgQ2x1c3RlckxlYWYpXG4gICAgICAgICAgICAgICAgICAgIG9iai5pbmRleC5wdXNoKGNsdXN0ZXJlZFtpaV1bampdKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIG9iai5pbmRleCA9IG9iai5pbmRleC5jb25jYXQoY2x1c3RlcmVkW2lpXVtqal0uaW5kZXgpO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIERlbGV0ZSB0aGUgbmV3bHkgY2x1c3RlcmVkIENsdXN0ZXJMZWFmL0NsdXN0ZXIgZnJvbSB0aGUgd29ya2luZyBsaXN0IG9mIHRoaW5ncyB0aGF0XG4gICAgICAgICAgICAgICAgLy8gc3RpbGwgbmVlZCB0byBiZSBjbHVzdGVyZWRcbiAgICAgICAgICAgICAgICBsaXN0LnNwbGljZSgobGlzdC5pbmRleE9mKGNsdXN0ZXJlZFtpaV1bampdKSksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGlzdC5wdXNoKG9iaik7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGxpc3RbMF07XG59XG5cbm1vZHVsZS5leHBvcnRzID0gYWduZXM7IiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZXVjbGlkZWFuID0gcmVxdWlyZSgnLi9tbC1ldWNsaWRlYW4tZGlzdGFuY2UnKTtcbnZhciBDbHVzdGVyTGVhZiA9IHJlcXVpcmUoJy4vQ2x1c3RlckxlYWYnKTtcbnZhciBDbHVzdGVyID0gcmVxdWlyZSgnLi9DbHVzdGVyJyk7XG5cbi8qKlxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBjbHVzdGVyMVxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBjbHVzdGVyMlxuICogQHBhcmFtIHtmdW5jdGlvbn0gZGlzRnVuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiBzaW1wbGVMaW5rKGNsdXN0ZXIxLCBjbHVzdGVyMiwgZGlzRnVuKSB7XG4gICAgdmFyIG0gPSAxMGUxMDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKylcbiAgICAgICAgZm9yICh2YXIgaiA9IGk7IGogPCBjbHVzdGVyMi5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgdmFyIGQgPSBkaXNGdW4oY2x1c3RlcjFbaV0sIGNsdXN0ZXIyW2pdKTtcbiAgICAgICAgICAgIG0gPSBNYXRoLm1pbihkLG0pO1xuICAgICAgICB9XG4gICAgcmV0dXJuIG07XG59XG5cbi8qKlxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBjbHVzdGVyMVxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBjbHVzdGVyMlxuICogQHBhcmFtIHtmdW5jdGlvbn0gZGlzRnVuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiBjb21wbGV0ZUxpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgbSA9IC0xO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3RlcjEubGVuZ3RoOyBpKyspXG4gICAgICAgIGZvciAodmFyIGogPSBpOyBqIDwgY2x1c3RlcjIubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIHZhciBkID0gZGlzRnVuKGNsdXN0ZXIxW2ldLCBjbHVzdGVyMltqXSk7XG4gICAgICAgICAgICBtID0gTWF0aC5tYXgoZCxtKTtcbiAgICAgICAgfVxuICAgIHJldHVybiBtO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gY2x1c3RlcjFcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gY2x1c3RlcjJcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gYXZlcmFnZUxpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgbSA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKylcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjbHVzdGVyMi5sZW5ndGg7IGorKylcbiAgICAgICAgICAgIG0gKz0gZGlzRnVuKGNsdXN0ZXIxW2ldLCBjbHVzdGVyMltqXSk7XG4gICAgcmV0dXJuIG0gLyAoY2x1c3RlcjEubGVuZ3RoICogY2x1c3RlcjIubGVuZ3RoKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGNsdXN0ZXIxXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGNsdXN0ZXIyXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkaXNGdW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIGNlbnRyb2lkTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciB4MSA9IDAsXG4gICAgICAgIHkxID0gMCxcbiAgICAgICAgeDIgPSAwLFxuICAgICAgICB5MiA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKykge1xuICAgICAgICB4MSArPSBjbHVzdGVyMVtpXVswXTtcbiAgICAgICAgeTEgKz0gY2x1c3RlcjFbaV1bMV07XG4gICAgfVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgY2x1c3RlcjIubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgeDIgKz0gY2x1c3RlcjJbal1bMF07XG4gICAgICAgIHkyICs9IGNsdXN0ZXIyW2pdWzFdO1xuICAgIH1cbiAgICB4MSAvPSBjbHVzdGVyMS5sZW5ndGg7XG4gICAgeTEgLz0gY2x1c3RlcjEubGVuZ3RoO1xuICAgIHgyIC89IGNsdXN0ZXIyLmxlbmd0aDtcbiAgICB5MiAvPSBjbHVzdGVyMi5sZW5ndGg7XG4gICAgcmV0dXJuIGRpc0Z1bihbeDEseTFdLCBbeDIseTJdKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGNsdXN0ZXIxXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGNsdXN0ZXIyXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkaXNGdW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIHdhcmRMaW5rKGNsdXN0ZXIxLCBjbHVzdGVyMiwgZGlzRnVuKSB7XG4gICAgdmFyIHgxID0gMCxcbiAgICAgICAgeTEgPSAwLFxuICAgICAgICB4MiA9IDAsXG4gICAgICAgIHkyID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsdXN0ZXIxLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHgxICs9IGNsdXN0ZXIxW2ldWzBdO1xuICAgICAgICB5MSArPSBjbHVzdGVyMVtpXVsxXTtcbiAgICB9XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBjbHVzdGVyMi5sZW5ndGg7IGorKykge1xuICAgICAgICB4MiArPSBjbHVzdGVyMltqXVswXTtcbiAgICAgICAgeTIgKz0gY2x1c3RlcjJbal1bMV07XG4gICAgfVxuICAgIHgxIC89IGNsdXN0ZXIxLmxlbmd0aDtcbiAgICB5MSAvPSBjbHVzdGVyMS5sZW5ndGg7XG4gICAgeDIgLz0gY2x1c3RlcjIubGVuZ3RoO1xuICAgIHkyIC89IGNsdXN0ZXIyLmxlbmd0aDtcbiAgICByZXR1cm4gZGlzRnVuKFt4MSx5MV0sIFt4Mix5Ml0pKmNsdXN0ZXIxLmxlbmd0aCpjbHVzdGVyMi5sZW5ndGggLyAoY2x1c3RlcjEubGVuZ3RoK2NsdXN0ZXIyLmxlbmd0aCk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbW9zdCBkaXN0YW50IHBvaW50IGFuZCBoaXMgZGlzdGFuY2VcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gc3BsaXR0aW5nIC0gQ2x1c3RlcnMgdG8gc3BsaXRcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gZGF0YSAtIE9yaWdpbmFsIGRhdGFcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRpc0Z1biAtIERpc3RhbmNlIGZ1bmN0aW9uXG4gKiBAcmV0dXJucyB7e2Q6IG51bWJlciwgcDogbnVtYmVyfX0gLSBkOiBtYXhpbXVtIGRpZmZlcmVuY2UgYmV0d2VlbiBwb2ludHMsIHA6IHRoZSBwb2ludCBtb3JlIGRpc3RhbnRcbiAqL1xuZnVuY3Rpb24gZGlmZihzcGxpdHRpbmcsIGRhdGEsIGRpc0Z1bikge1xuICAgIHZhciBhbnMgPSB7XG4gICAgICAgIGQ6MCxcbiAgICAgICAgcDowXG4gICAgfTtcblxuICAgIHZhciBDaSA9IG5ldyBBcnJheShzcGxpdHRpbmdbMF0ubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBlID0gMDsgZSA8IHNwbGl0dGluZ1swXS5sZW5ndGg7IGUrKylcbiAgICAgICAgQ2lbZV0gPSBkYXRhW3NwbGl0dGluZ1swXVtlXV07XG4gICAgdmFyIENqID0gbmV3IEFycmF5KHNwbGl0dGluZ1sxXS5sZW5ndGgpO1xuICAgIGZvciAodmFyIGYgPSAwOyBmIDwgc3BsaXR0aW5nWzFdLmxlbmd0aDsgZisrKVxuICAgICAgICBDaltmXSA9IGRhdGFbc3BsaXR0aW5nWzFdW2ZdXTtcblxuICAgIHZhciBkaXN0LCBuZGlzdDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IENpLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGRpc3QgPSAwO1xuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IENpLmxlbmd0aDsgaisrKVxuICAgICAgICAgICAgaWYgKGkgIT09IGopXG4gICAgICAgICAgICAgICAgZGlzdCArPSBkaXNGdW4oQ2lbaV0sIENpW2pdKTtcbiAgICAgICAgZGlzdCAvPSAoQ2kubGVuZ3RoIC0gMSk7XG4gICAgICAgIG5kaXN0ID0gMDtcbiAgICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBDai5sZW5ndGg7IGsrKylcbiAgICAgICAgICAgIG5kaXN0ICs9IGRpc0Z1bihDaVtpXSwgQ2pba10pO1xuICAgICAgICBuZGlzdCAvPSBDai5sZW5ndGg7XG4gICAgICAgIGlmICgoZGlzdCAtIG5kaXN0KSA+IGFucy5kKSB7XG4gICAgICAgICAgICBhbnMuZCA9IChkaXN0IC0gbmRpc3QpO1xuICAgICAgICAgICAgYW5zLnAgPSBpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBhbnM7XG59XG5cbnZhciBkZWZhdWx0T3B0aW9ucyA9IHtcbiAgICBkaXN0OiBldWNsaWRlYW4sXG4gICAga2luZDogJ3NpbmdsZSdcbn07XG5cbi8qKlxuICogSW50cmEtY2x1c3RlciBkaXN0YW5jZVxuICogQHBhcmFtIHtBcnJheX0gaW5kZXhcbiAqIEBwYXJhbSB7QXJyYXl9IGRhdGFcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gaW50ckRpc3QoaW5kZXgsIGRhdGEsIGRpc0Z1bikge1xuICAgIHZhciBkaXN0ID0gMCxcbiAgICAgICAgY291bnQgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW5kZXgubGVuZ3RoOyBpKyspXG4gICAgICAgIGZvciAodmFyIGogPSBpOyBqIDwgaW5kZXgubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIGRpc3QgKz0gZGlzRnVuKGRhdGFbaW5kZXhbaV0uaW5kZXhdLCBkYXRhW2luZGV4W2pdLmluZGV4XSk7XG4gICAgICAgICAgICBjb3VudCsrXG4gICAgICAgIH1cbiAgICByZXR1cm4gZGlzdCAvIGNvdW50O1xufVxuXG4vKipcbiAqIFNwbGl0cyB0aGUgaGlnaGVyIGxldmVsIGNsdXN0ZXJzXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGRhdGEgLSBBcnJheSBvZiBwb2ludHMgdG8gYmUgY2x1c3RlcmVkXG4gKiBAcGFyYW0ge2pzb259IG9wdGlvbnNcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBkaWFuYShkYXRhLCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgZm9yICh2YXIgbyBpbiBkZWZhdWx0T3B0aW9ucylcbiAgICAgICAgaWYgKCEob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShvKSkpXG4gICAgICAgICAgICBvcHRpb25zW29dID0gZGVmYXVsdE9wdGlvbnNbb107XG4gICAgaWYgKHR5cGVvZiBvcHRpb25zLmtpbmQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgc3dpdGNoIChvcHRpb25zLmtpbmQpIHtcbiAgICAgICAgICAgIGNhc2UgJ3NpbmdsZSc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gc2ltcGxlTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2NvbXBsZXRlJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSBjb21wbGV0ZUxpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdhdmVyYWdlJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSBhdmVyYWdlTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2NlbnRyb2lkJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSBjZW50cm9pZExpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd3YXJkJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSB3YXJkTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1Vua25vd24ga2luZCBvZiBzaW1pbGFyaXR5Jyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMua2luZCAhPT0gXCJmdW5jdGlvblwiKVxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmRlZmluZWQga2luZCBvZiBzaW1pbGFyaXR5Jyk7XG4gICAgdmFyIHRyZWUgPSBuZXcgQ2x1c3RlcigpO1xuICAgIHRyZWUuY2hpbGRyZW4gPSBuZXcgQXJyYXkoZGF0YS5sZW5ndGgpO1xuICAgIHRyZWUuaW5kZXggPSBuZXcgQXJyYXkoZGF0YS5sZW5ndGgpO1xuICAgIGZvciAodmFyIGluZCA9IDA7IGluZCA8IGRhdGEubGVuZ3RoOyBpbmQrKykge1xuICAgICAgICB0cmVlLmNoaWxkcmVuW2luZF0gPSBuZXcgQ2x1c3RlckxlYWYoaW5kKTtcbiAgICAgICAgdHJlZS5pbmRleFtpbmRdID0gbmV3IENsdXN0ZXJMZWFmKGluZCk7XG4gICAgfVxuXG4gICAgdHJlZS5kaXN0YW5jZSA9IGludHJEaXN0KHRyZWUuaW5kZXgsIGRhdGEsIG9wdGlvbnMuZGlzdCk7XG4gICAgdmFyIG0sIE0sIGNsSWQsXG4gICAgICAgIGRpc3QsIHJlYmVsO1xuICAgIHZhciBsaXN0ID0gW3RyZWVdO1xuICAgIHdoaWxlIChsaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgTSA9IDA7XG4gICAgICAgIGNsSWQgPSAwO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIG0gPSAwO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBsaXN0W2ldLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgbCA9IChqICsgMSk7IGwgPCBsaXN0W2ldLmxlbmd0aDsgbCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIG0gPSBNYXRoLm1heChvcHRpb25zLmRpc3QoZGF0YVtsaXN0W2ldLmluZGV4W2pdLmluZGV4XSwgZGF0YVtsaXN0W2ldLmluZGV4W2xdLmluZGV4XSksIG0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChtID4gTSkge1xuICAgICAgICAgICAgICAgIE0gPSBtO1xuICAgICAgICAgICAgICAgIGNsSWQgPSBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIE0gPSAwO1xuICAgICAgICBpZiAobGlzdFtjbElkXS5pbmRleC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIGxpc3RbY2xJZF0uY2hpbGRyZW4gPSBbbGlzdFtjbElkXS5pbmRleFswXSwgbGlzdFtjbElkXS5pbmRleFsxXV07XG4gICAgICAgICAgICBsaXN0W2NsSWRdLmRpc3RhbmNlID0gb3B0aW9ucy5kaXN0KGRhdGFbbGlzdFtjbElkXS5pbmRleFswXS5pbmRleF0sIGRhdGFbbGlzdFtjbElkXS5pbmRleFsxXS5pbmRleF0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGxpc3RbY2xJZF0uaW5kZXgubGVuZ3RoID09PSAzKSB7XG4gICAgICAgICAgICBsaXN0W2NsSWRdLmNoaWxkcmVuID0gW2xpc3RbY2xJZF0uaW5kZXhbMF0sIGxpc3RbY2xJZF0uaW5kZXhbMV0sIGxpc3RbY2xJZF0uaW5kZXhbMl1dO1xuICAgICAgICAgICAgdmFyIGQgPSBbXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5kaXN0KGRhdGFbbGlzdFtjbElkXS5pbmRleFswXS5pbmRleF0sIGRhdGFbbGlzdFtjbElkXS5pbmRleFsxXS5pbmRleF0pLFxuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGlzdChkYXRhW2xpc3RbY2xJZF0uaW5kZXhbMV0uaW5kZXhdLCBkYXRhW2xpc3RbY2xJZF0uaW5kZXhbMl0uaW5kZXhdKVxuICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIGxpc3RbY2xJZF0uZGlzdGFuY2UgPSAoZFswXSArIGRbMV0pIC8gMjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBDID0gbmV3IENsdXN0ZXIoKTtcbiAgICAgICAgICAgIHZhciBzRyA9IG5ldyBDbHVzdGVyKCk7XG4gICAgICAgICAgICB2YXIgc3BsaXR0aW5nID0gW25ldyBBcnJheShsaXN0W2NsSWRdLmluZGV4Lmxlbmd0aCksIFtdXTtcbiAgICAgICAgICAgIGZvciAodmFyIHNwbCA9IDA7IHNwbCA8IHNwbGl0dGluZ1swXS5sZW5ndGg7IHNwbCsrKVxuICAgICAgICAgICAgICAgIHNwbGl0dGluZ1swXVtzcGxdID0gc3BsO1xuICAgICAgICAgICAgZm9yICh2YXIgaWkgPSAwOyBpaSA8IHNwbGl0dGluZ1swXS5sZW5ndGg7IGlpKyspIHtcbiAgICAgICAgICAgICAgICBkaXN0ID0gMDtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBqaiA9IDA7IGpqIDwgc3BsaXR0aW5nWzBdLmxlbmd0aDsgamorKylcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlpICE9PSBqailcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3QgKz0gb3B0aW9ucy5kaXN0KGRhdGFbbGlzdFtjbElkXS5pbmRleFtzcGxpdHRpbmdbMF1bampdXS5pbmRleF0sIGRhdGFbbGlzdFtjbElkXS5pbmRleFtzcGxpdHRpbmdbMF1baWldXS5pbmRleF0pO1xuICAgICAgICAgICAgICAgIGRpc3QgLz0gKHNwbGl0dGluZ1swXS5sZW5ndGggLSAxKTtcbiAgICAgICAgICAgICAgICBpZiAoZGlzdCA+IE0pIHtcbiAgICAgICAgICAgICAgICAgICAgTSA9IGRpc3Q7XG4gICAgICAgICAgICAgICAgICAgIHJlYmVsID0gaWk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc3BsaXR0aW5nWzFdID0gW3JlYmVsXTtcbiAgICAgICAgICAgIHNwbGl0dGluZ1swXS5zcGxpY2UocmViZWwsIDEpO1xuICAgICAgICAgICAgZGlzdCA9IGRpZmYoc3BsaXR0aW5nLCBkYXRhLCBvcHRpb25zLmRpc3QpO1xuICAgICAgICAgICAgd2hpbGUgKGRpc3QuZCA+IDApIHtcbiAgICAgICAgICAgICAgICBzcGxpdHRpbmdbMV0ucHVzaChzcGxpdHRpbmdbMF1bZGlzdC5wXSk7XG4gICAgICAgICAgICAgICAgc3BsaXR0aW5nWzBdLnNwbGljZShkaXN0LnAsIDEpO1xuICAgICAgICAgICAgICAgIGRpc3QgPSBkaWZmKHNwbGl0dGluZywgZGF0YSwgb3B0aW9ucy5kaXN0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBmRGF0YSA9IG5ldyBBcnJheShzcGxpdHRpbmdbMF0ubGVuZ3RoKTtcbiAgICAgICAgICAgIEMuaW5kZXggPSBuZXcgQXJyYXkoc3BsaXR0aW5nWzBdLmxlbmd0aCk7XG4gICAgICAgICAgICBmb3IgKHZhciBlID0gMDsgZSA8IGZEYXRhLmxlbmd0aDsgZSsrKSB7XG4gICAgICAgICAgICAgICAgZkRhdGFbZV0gPSBkYXRhW2xpc3RbY2xJZF0uaW5kZXhbc3BsaXR0aW5nWzBdW2VdXS5pbmRleF07XG4gICAgICAgICAgICAgICAgQy5pbmRleFtlXSA9IGxpc3RbY2xJZF0uaW5kZXhbc3BsaXR0aW5nWzBdW2VdXTtcbiAgICAgICAgICAgICAgICBDLmNoaWxkcmVuW2VdID0gbGlzdFtjbElkXS5pbmRleFtzcGxpdHRpbmdbMF1bZV1dO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIHNEYXRhID0gbmV3IEFycmF5KHNwbGl0dGluZ1sxXS5sZW5ndGgpO1xuICAgICAgICAgICAgc0cuaW5kZXggPSBuZXcgQXJyYXkoc3BsaXR0aW5nWzFdLmxlbmd0aCk7XG4gICAgICAgICAgICBmb3IgKHZhciBmID0gMDsgZiA8IHNEYXRhLmxlbmd0aDsgZisrKSB7XG4gICAgICAgICAgICAgICAgc0RhdGFbZl0gPSBkYXRhW2xpc3RbY2xJZF0uaW5kZXhbc3BsaXR0aW5nWzFdW2ZdXS5pbmRleF07XG4gICAgICAgICAgICAgICAgc0cuaW5kZXhbZl0gPSBsaXN0W2NsSWRdLmluZGV4W3NwbGl0dGluZ1sxXVtmXV07XG4gICAgICAgICAgICAgICAgc0cuY2hpbGRyZW5bZl0gPSBsaXN0W2NsSWRdLmluZGV4W3NwbGl0dGluZ1sxXVtmXV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBDLmRpc3RhbmNlID0gaW50ckRpc3QoQy5pbmRleCwgZGF0YSwgb3B0aW9ucy5kaXN0KTtcbiAgICAgICAgICAgIHNHLmRpc3RhbmNlID0gaW50ckRpc3Qoc0cuaW5kZXgsIGRhdGEsIG9wdGlvbnMuZGlzdCk7XG4gICAgICAgICAgICBsaXN0LnB1c2goQyk7XG4gICAgICAgICAgICBsaXN0LnB1c2goc0cpO1xuICAgICAgICAgICAgbGlzdFtjbElkXS5jaGlsZHJlbiA9IFtDLCBzR107XG4gICAgICAgIH1cbiAgICAgICAgbGlzdC5zcGxpY2UoY2xJZCwgMSk7XG4gICAgfVxuICAgIHJldHVybiB0cmVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGRpYW5hOyIsIid1c2Ugc3RyaWN0JztcblxuaWYgKCFBcnJheS5wcm90b3R5cGUuZmluZEluZGV4KSB7XG4gIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShBcnJheS5wcm90b3R5cGUsICdmaW5kSW5kZXgnLCB7XG4gICAgdmFsdWU6IGZ1bmN0aW9uKHByZWRpY2F0ZSkge1xuICAgICAvLyAxLiBMZXQgTyBiZSA/IFRvT2JqZWN0KHRoaXMgdmFsdWUpLlxuICAgICAgaWYgKHRoaXMgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdcInRoaXNcIiBpcyBudWxsIG9yIG5vdCBkZWZpbmVkJyk7XG4gICAgICB9XG5cbiAgICAgIHZhciBvID0gT2JqZWN0KHRoaXMpO1xuXG4gICAgICAvLyAyLiBMZXQgbGVuIGJlID8gVG9MZW5ndGgoPyBHZXQoTywgXCJsZW5ndGhcIikpLlxuICAgICAgdmFyIGxlbiA9IG8ubGVuZ3RoID4+PiAwO1xuXG4gICAgICAvLyAzLiBJZiBJc0NhbGxhYmxlKHByZWRpY2F0ZSkgaXMgZmFsc2UsIHRocm93IGEgVHlwZUVycm9yIGV4Y2VwdGlvbi5cbiAgICAgIGlmICh0eXBlb2YgcHJlZGljYXRlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ByZWRpY2F0ZSBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICAgIH1cblxuICAgICAgLy8gNC4gSWYgdGhpc0FyZyB3YXMgc3VwcGxpZWQsIGxldCBUIGJlIHRoaXNBcmc7IGVsc2UgbGV0IFQgYmUgdW5kZWZpbmVkLlxuICAgICAgdmFyIHRoaXNBcmcgPSBhcmd1bWVudHNbMV07XG5cbiAgICAgIC8vIDUuIExldCBrIGJlIDAuXG4gICAgICB2YXIgayA9IDA7XG5cbiAgICAgIC8vIDYuIFJlcGVhdCwgd2hpbGUgayA8IGxlblxuICAgICAgd2hpbGUgKGsgPCBsZW4pIHtcbiAgICAgICAgLy8gYS4gTGV0IFBrIGJlICEgVG9TdHJpbmcoaykuXG4gICAgICAgIC8vIGIuIExldCBrVmFsdWUgYmUgPyBHZXQoTywgUGspLlxuICAgICAgICAvLyBjLiBMZXQgdGVzdFJlc3VsdCBiZSBUb0Jvb2xlYW4oPyBDYWxsKHByZWRpY2F0ZSwgVCwgwqsga1ZhbHVlLCBrLCBPIMK7KSkuXG4gICAgICAgIC8vIGQuIElmIHRlc3RSZXN1bHQgaXMgdHJ1ZSwgcmV0dXJuIGsuXG4gICAgICAgIHZhciBrVmFsdWUgPSBvW2tdO1xuICAgICAgICBpZiAocHJlZGljYXRlLmNhbGwodGhpc0FyZywga1ZhbHVlLCBrLCBvKSkge1xuICAgICAgICAgIHJldHVybiBrO1xuICAgICAgICB9XG4gICAgICAgIC8vIGUuIEluY3JlYXNlIGsgYnkgMS5cbiAgICAgICAgaysrO1xuICAgICAgfVxuXG4gICAgICAvLyA3LiBSZXR1cm4gLTEuXG4gICAgICByZXR1cm4gLTE7XG4gICAgfSxcbiAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgd3JpdGFibGU6IHRydWVcbiAgfSk7XG59IiwiZXhwb3J0cy5hZ25lcyA9IHJlcXVpcmUoJy4vYWduZXMnKTtcbmV4cG9ydHMuZGlhbmEgPSByZXF1aXJlKCcuL2RpYW5hJyk7XG4vL2V4cG9ydHMuYmlyY2ggPSByZXF1aXJlKCcuL2JpcmNoJyk7XG4vL2V4cG9ydHMuY3VyZSA9IHJlcXVpcmUoJy4vY3VyZScpO1xuLy9leHBvcnRzLmNoYW1lbGVvbiA9IHJlcXVpcmUoJy4vY2hhbWVsZW9uJyk7IiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBtbC1ldWNsaWRlYW4tZGlzdGFuY2Vcbi8vIEZyb206IGh0dHBzOi8vZ2l0aHViLmNvbS9tbGpzL2V1Y2xpZGVhbi1kaXN0YW5jZVxuLy8gTGljZW5zZTogTUlUXG5cbmZ1bmN0aW9uIHNxdWFyZWRFdWNsaWRlYW4ocCwgcSkge1xuICAgIHZhciBkID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHAubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZCArPSAocFtpXSAtIHFbaV0pICogKHBbaV0gLSBxW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIGQ7XG59XG5cbmZ1bmN0aW9uIGV1Y2xpZGVhbihwLCBxKSB7XG4gICAgcmV0dXJuIE1hdGguc3FydChzcXVhcmVkRXVjbGlkZWFuKHAsIHEpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBldWNsaWRlYW47XG5ldWNsaWRlYW4uc3F1YXJlZCA9IHNxdWFyZWRFdWNsaWRlYW47IiwiaWYgKHR5cGVvZiBPYmplY3QuY3JlYXRlID09PSAnZnVuY3Rpb24nKSB7XG4gIC8vIGltcGxlbWVudGF0aW9uIGZyb20gc3RhbmRhcmQgbm9kZS5qcyAndXRpbCcgbW9kdWxlXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICBjdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoc3VwZXJDdG9yLnByb3RvdHlwZSwge1xuICAgICAgY29uc3RydWN0b3I6IHtcbiAgICAgICAgdmFsdWU6IGN0b3IsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59IGVsc2Uge1xuICAvLyBvbGQgc2Nob29sIHNoaW0gZm9yIG9sZCBicm93c2Vyc1xuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgdmFyIFRlbXBDdG9yID0gZnVuY3Rpb24gKCkge31cbiAgICBUZW1wQ3Rvci5wcm90b3R5cGUgPSBzdXBlckN0b3IucHJvdG90eXBlXG4gICAgY3Rvci5wcm90b3R5cGUgPSBuZXcgVGVtcEN0b3IoKVxuICAgIGN0b3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY3RvclxuICB9XG59XG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gc2V0VGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNCdWZmZXIoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgdHlwZW9mIGFyZyA9PT0gJ29iamVjdCdcbiAgICAmJiB0eXBlb2YgYXJnLmNvcHkgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLmZpbGwgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLnJlYWRVSW50OCA9PT0gJ2Z1bmN0aW9uJztcbn0iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIGZvcm1hdFJlZ0V4cCA9IC8lW3NkaiVdL2c7XG5leHBvcnRzLmZvcm1hdCA9IGZ1bmN0aW9uKGYpIHtcbiAgaWYgKCFpc1N0cmluZyhmKSkge1xuICAgIHZhciBvYmplY3RzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG9iamVjdHMucHVzaChpbnNwZWN0KGFyZ3VtZW50c1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0cy5qb2luKCcgJyk7XG4gIH1cblxuICB2YXIgaSA9IDE7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG4gIHZhciBzdHIgPSBTdHJpbmcoZikucmVwbGFjZShmb3JtYXRSZWdFeHAsIGZ1bmN0aW9uKHgpIHtcbiAgICBpZiAoeCA9PT0gJyUlJykgcmV0dXJuICclJztcbiAgICBpZiAoaSA+PSBsZW4pIHJldHVybiB4O1xuICAgIHN3aXRjaCAoeCkge1xuICAgICAgY2FzZSAnJXMnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclZCc6IHJldHVybiBOdW1iZXIoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVqJzpcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnc1tpKytdKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbiAgfSk7XG4gIGZvciAodmFyIHggPSBhcmdzW2ldOyBpIDwgbGVuOyB4ID0gYXJnc1srK2ldKSB7XG4gICAgaWYgKGlzTnVsbCh4KSB8fCAhaXNPYmplY3QoeCkpIHtcbiAgICAgIHN0ciArPSAnICcgKyB4O1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gJyAnICsgaW5zcGVjdCh4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn07XG5cblxuLy8gTWFyayB0aGF0IGEgbWV0aG9kIHNob3VsZCBub3QgYmUgdXNlZC5cbi8vIFJldHVybnMgYSBtb2RpZmllZCBmdW5jdGlvbiB3aGljaCB3YXJucyBvbmNlIGJ5IGRlZmF1bHQuXG4vLyBJZiAtLW5vLWRlcHJlY2F0aW9uIGlzIHNldCwgdGhlbiBpdCBpcyBhIG5vLW9wLlxuZXhwb3J0cy5kZXByZWNhdGUgPSBmdW5jdGlvbihmbiwgbXNnKSB7XG4gIC8vIEFsbG93IGZvciBkZXByZWNhdGluZyB0aGluZ3MgaW4gdGhlIHByb2Nlc3Mgb2Ygc3RhcnRpbmcgdXAuXG4gIGlmIChpc1VuZGVmaW5lZChnbG9iYWwucHJvY2VzcykpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZXByZWNhdGUoZm4sIG1zZykuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiAgaWYgKHByb2Nlc3Mubm9EZXByZWNhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHZhciB3YXJuZWQgPSBmYWxzZTtcbiAgZnVuY3Rpb24gZGVwcmVjYXRlZCgpIHtcbiAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgaWYgKHByb2Nlc3MudGhyb3dEZXByZWNhdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy50cmFjZURlcHJlY2F0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUudHJhY2UobXNnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgICAgIH1cbiAgICAgIHdhcm5lZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgcmV0dXJuIGRlcHJlY2F0ZWQ7XG59O1xuXG5cbnZhciBkZWJ1Z3MgPSB7fTtcbnZhciBkZWJ1Z0Vudmlyb247XG5leHBvcnRzLmRlYnVnbG9nID0gZnVuY3Rpb24oc2V0KSB7XG4gIGlmIChpc1VuZGVmaW5lZChkZWJ1Z0Vudmlyb24pKVxuICAgIGRlYnVnRW52aXJvbiA9IHByb2Nlc3MuZW52Lk5PREVfREVCVUcgfHwgJyc7XG4gIHNldCA9IHNldC50b1VwcGVyQ2FzZSgpO1xuICBpZiAoIWRlYnVnc1tzZXRdKSB7XG4gICAgaWYgKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNldCArICdcXFxcYicsICdpJykudGVzdChkZWJ1Z0Vudmlyb24pKSB7XG4gICAgICB2YXIgcGlkID0gcHJvY2Vzcy5waWQ7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXNnID0gZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJXMgJWQ6ICVzJywgc2V0LCBwaWQsIG1zZyk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWJ1Z3Nbc2V0XTtcbn07XG5cblxuLyoqXG4gKiBFY2hvcyB0aGUgdmFsdWUgb2YgYSB2YWx1ZS4gVHJ5cyB0byBwcmludCB0aGUgdmFsdWUgb3V0XG4gKiBpbiB0aGUgYmVzdCB3YXkgcG9zc2libGUgZ2l2ZW4gdGhlIGRpZmZlcmVudCB0eXBlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcHJpbnQgb3V0LlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QgdGhhdCBhbHRlcnMgdGhlIG91dHB1dC5cbiAqL1xuLyogbGVnYWN5OiBvYmosIHNob3dIaWRkZW4sIGRlcHRoLCBjb2xvcnMqL1xuZnVuY3Rpb24gaW5zcGVjdChvYmosIG9wdHMpIHtcbiAgLy8gZGVmYXVsdCBvcHRpb25zXG4gIHZhciBjdHggPSB7XG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogc3R5bGl6ZU5vQ29sb3JcbiAgfTtcbiAgLy8gbGVnYWN5Li4uXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIGN0eC5kZXB0aCA9IGFyZ3VtZW50c1syXTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gNCkgY3R4LmNvbG9ycyA9IGFyZ3VtZW50c1szXTtcbiAgaWYgKGlzQm9vbGVhbihvcHRzKSkge1xuICAgIC8vIGxlZ2FjeS4uLlxuICAgIGN0eC5zaG93SGlkZGVuID0gb3B0cztcbiAgfSBlbHNlIGlmIChvcHRzKSB7XG4gICAgLy8gZ290IGFuIFwib3B0aW9uc1wiIG9iamVjdFxuICAgIGV4cG9ydHMuX2V4dGVuZChjdHgsIG9wdHMpO1xuICB9XG4gIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5zaG93SGlkZGVuKSkgY3R4LnNob3dIaWRkZW4gPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5kZXB0aCkpIGN0eC5kZXB0aCA9IDI7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY29sb3JzKSkgY3R4LmNvbG9ycyA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmN1c3RvbUluc3BlY3QpKSBjdHguY3VzdG9tSW5zcGVjdCA9IHRydWU7XG4gIGlmIChjdHguY29sb3JzKSBjdHguc3R5bGl6ZSA9IHN0eWxpemVXaXRoQ29sb3I7XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgY3R4LmRlcHRoKTtcbn1cbmV4cG9ydHMuaW5zcGVjdCA9IGluc3BlY3Q7XG5cblxuLy8gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI2dyYXBoaWNzXG5pbnNwZWN0LmNvbG9ycyA9IHtcbiAgJ2JvbGQnIDogWzEsIDIyXSxcbiAgJ2l0YWxpYycgOiBbMywgMjNdLFxuICAndW5kZXJsaW5lJyA6IFs0LCAyNF0sXG4gICdpbnZlcnNlJyA6IFs3LCAyN10sXG4gICd3aGl0ZScgOiBbMzcsIDM5XSxcbiAgJ2dyZXknIDogWzkwLCAzOV0sXG4gICdibGFjaycgOiBbMzAsIDM5XSxcbiAgJ2JsdWUnIDogWzM0LCAzOV0sXG4gICdjeWFuJyA6IFszNiwgMzldLFxuICAnZ3JlZW4nIDogWzMyLCAzOV0sXG4gICdtYWdlbnRhJyA6IFszNSwgMzldLFxuICAncmVkJyA6IFszMSwgMzldLFxuICAneWVsbG93JyA6IFszMywgMzldXG59O1xuXG4vLyBEb24ndCB1c2UgJ2JsdWUnIG5vdCB2aXNpYmxlIG9uIGNtZC5leGVcbmluc3BlY3Quc3R5bGVzID0ge1xuICAnc3BlY2lhbCc6ICdjeWFuJyxcbiAgJ251bWJlcic6ICd5ZWxsb3cnLFxuICAnYm9vbGVhbic6ICd5ZWxsb3cnLFxuICAndW5kZWZpbmVkJzogJ2dyZXknLFxuICAnbnVsbCc6ICdib2xkJyxcbiAgJ3N0cmluZyc6ICdncmVlbicsXG4gICdkYXRlJzogJ21hZ2VudGEnLFxuICAvLyBcIm5hbWVcIjogaW50ZW50aW9uYWxseSBub3Qgc3R5bGluZ1xuICAncmVnZXhwJzogJ3JlZCdcbn07XG5cblxuZnVuY3Rpb24gc3R5bGl6ZVdpdGhDb2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICB2YXIgc3R5bGUgPSBpbnNwZWN0LnN0eWxlc1tzdHlsZVR5cGVdO1xuXG4gIGlmIChzdHlsZSkge1xuICAgIHJldHVybiAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzBdICsgJ20nICsgc3RyICtcbiAgICAgICAgICAgJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVsxXSArICdtJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59XG5cblxuZnVuY3Rpb24gc3R5bGl6ZU5vQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgcmV0dXJuIHN0cjtcbn1cblxuXG5mdW5jdGlvbiBhcnJheVRvSGFzaChhcnJheSkge1xuICB2YXIgaGFzaCA9IHt9O1xuXG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsLCBpZHgpIHtcbiAgICBoYXNoW3ZhbF0gPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaGFzaDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMpIHtcbiAgLy8gUHJvdmlkZSBhIGhvb2sgZm9yIHVzZXItc3BlY2lmaWVkIGluc3BlY3QgZnVuY3Rpb25zLlxuICAvLyBDaGVjayB0aGF0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFuIGluc3BlY3QgZnVuY3Rpb24gb24gaXRcbiAgaWYgKGN0eC5jdXN0b21JbnNwZWN0ICYmXG4gICAgICB2YWx1ZSAmJlxuICAgICAgaXNGdW5jdGlvbih2YWx1ZS5pbnNwZWN0KSAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcywgY3R4KTtcbiAgICBpZiAoIWlzU3RyaW5nKHJldCkpIHtcbiAgICAgIHJldCA9IGZvcm1hdFZhbHVlKGN0eCwgcmV0LCByZWN1cnNlVGltZXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gUHJpbWl0aXZlIHR5cGVzIGNhbm5vdCBoYXZlIHByb3BlcnRpZXNcbiAgdmFyIHByaW1pdGl2ZSA9IGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKTtcbiAgaWYgKHByaW1pdGl2ZSkge1xuICAgIHJldHVybiBwcmltaXRpdmU7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICB2YXIgdmlzaWJsZUtleXMgPSBhcnJheVRvSGFzaChrZXlzKTtcblxuICBpZiAoY3R4LnNob3dIaWRkZW4pIHtcbiAgICBrZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModmFsdWUpO1xuICB9XG5cbiAgLy8gSUUgZG9lc24ndCBtYWtlIGVycm9yIGZpZWxkcyBub24tZW51bWVyYWJsZVxuICAvLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvaWUvZHd3NTJzYnQodj12cy45NCkuYXNweFxuICBpZiAoaXNFcnJvcih2YWx1ZSlcbiAgICAgICYmIChrZXlzLmluZGV4T2YoJ21lc3NhZ2UnKSA+PSAwIHx8IGtleXMuaW5kZXhPZignZGVzY3JpcHRpb24nKSA+PSAwKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICAvLyBTb21lIHR5cGUgb2Ygb2JqZWN0IHdpdGhvdXQgcHJvcGVydGllcyBjYW4gYmUgc2hvcnRjdXR0ZWQuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgdmFyIG5hbWUgPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWUgKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgdmFyIG4gPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbiArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ3VuZGVmaW5lZCcsICd1bmRlZmluZWQnKTtcbiAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcbiAgfVxuICBpZiAoaXNOdW1iZXIodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG4gIGlmIChpc0Jvb2xlYW4odmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmIChpc051bGwodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0RXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuICdbJyArIEVycm9yLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSArICddJztcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB2YWx1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0ciwgZGVzYztcbiAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodmFsdWUsIGtleSkgfHwgeyB2YWx1ZTogdmFsdWVba2V5XSB9O1xuICBpZiAoZGVzYy5nZXQpIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICghaGFzT3duUHJvcGVydHkodmlzaWJsZUtleXMsIGtleSkpIHtcbiAgICBuYW1lID0gJ1snICsga2V5ICsgJ10nO1xuICB9XG4gIGlmICghc3RyKSB7XG4gICAgaWYgKGN0eC5zZWVuLmluZGV4T2YoZGVzYy52YWx1ZSkgPCAwKSB7XG4gICAgICBpZiAoaXNOdWxsKHJlY3Vyc2VUaW1lcykpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNVbmRlZmluZWQobmFtZSkpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIucmVwbGFjZSgvXFx1MDAxYlxcW1xcZFxcZD9tL2csICcnKS5sZW5ndGggKyAxO1xuICB9LCAwKTtcblxuICBpZiAobGVuZ3RoID4gNjApIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICtcbiAgICAgICAgICAgKGJhc2UgPT09ICcnID8gJycgOiBiYXNlICsgJ1xcbiAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIG91dHB1dC5qb2luKCcsXFxuICAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIGJyYWNlc1sxXTtcbiAgfVxuXG4gIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgJyAnICsgb3V0cHV0LmpvaW4oJywgJykgKyAnICcgKyBicmFjZXNbMV07XG59XG5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmV4cG9ydHMuaXNCdWZmZXIgPSByZXF1aXJlKCcuL3N1cHBvcnQvaXNCdWZmZXInKTtcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG5cbmZ1bmN0aW9uIHBhZChuKSB7XG4gIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuLnRvU3RyaW5nKDEwKSA6IG4udG9TdHJpbmcoMTApO1xufVxuXG5cbnZhciBtb250aHMgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJyxcbiAgICAgICAgICAgICAgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cbi8vIDI2IEZlYiAxNjoxOTozNFxuZnVuY3Rpb24gdGltZXN0YW1wKCkge1xuICB2YXIgZCA9IG5ldyBEYXRlKCk7XG4gIHZhciB0aW1lID0gW3BhZChkLmdldEhvdXJzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRNaW51dGVzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRTZWNvbmRzKCkpXS5qb2luKCc6Jyk7XG4gIHJldHVybiBbZC5nZXREYXRlKCksIG1vbnRoc1tkLmdldE1vbnRoKCldLCB0aW1lXS5qb2luKCcgJyk7XG59XG5cblxuLy8gbG9nIGlzIGp1c3QgYSB0aGluIHdyYXBwZXIgdG8gY29uc29sZS5sb2cgdGhhdCBwcmVwZW5kcyBhIHRpbWVzdGFtcFxuZXhwb3J0cy5sb2cgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJyVzIC0gJXMnLCB0aW1lc3RhbXAoKSwgZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSk7XG59O1xuXG5cbi8qKlxuICogSW5oZXJpdCB0aGUgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBvbmUgY29uc3RydWN0b3IgaW50byBhbm90aGVyLlxuICpcbiAqIFRoZSBGdW5jdGlvbi5wcm90b3R5cGUuaW5oZXJpdHMgZnJvbSBsYW5nLmpzIHJld3JpdHRlbiBhcyBhIHN0YW5kYWxvbmVcbiAqIGZ1bmN0aW9uIChub3Qgb24gRnVuY3Rpb24ucHJvdG90eXBlKS4gTk9URTogSWYgdGhpcyBmaWxlIGlzIHRvIGJlIGxvYWRlZFxuICogZHVyaW5nIGJvb3RzdHJhcHBpbmcgdGhpcyBmdW5jdGlvbiBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdXNpbmcgc29tZSBuYXRpdmVcbiAqIGZ1bmN0aW9ucyBhcyBwcm90b3R5cGUgc2V0dXAgdXNpbmcgbm9ybWFsIEphdmFTY3JpcHQgZG9lcyBub3Qgd29yayBhc1xuICogZXhwZWN0ZWQgZHVyaW5nIGJvb3RzdHJhcHBpbmcgKHNlZSBtaXJyb3IuanMgaW4gcjExNDkwMykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB3aGljaCBuZWVkcyB0byBpbmhlcml0IHRoZVxuICogICAgIHByb3RvdHlwZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IHN1cGVyQ3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBpbmhlcml0IHByb3RvdHlwZSBmcm9tLlxuICovXG5leHBvcnRzLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuZXhwb3J0cy5fZXh0ZW5kID0gZnVuY3Rpb24ob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCAhaXNPYmplY3QoYWRkKSkgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn07XG5cbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG4iXX0=

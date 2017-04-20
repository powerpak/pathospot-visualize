(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
(window || global).HClust = require('./hclust/src');
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./hclust/src":6}],2:[function(require,module,exports){
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

},{"./Cluster":2,"util":11}],4:[function(require,module,exports){
'use strict';

var euclidean = require('./ml-euclidean-distance');
var ClusterLeaf = require('./ClusterLeaf');
var Cluster = require('./Cluster');

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

        // Cluster the ClusterLeaf's and/or Cluster's for the links at this minimum distance.
        var dmin = d[min.toFixed(options.precision)];
        var clustered = [];
        var aux;
        while (dmin.length > 0) {
            aux = dmin.shift();
            for (var q = 0; q < dmin.length; q++) {
                var int = dmin[q].filter(function(n) {
                  return aux.indexOf(n) !== -1;
                });
                if (int.length > 0) {
                    var diff = dmin[q].filter(function(n) {
                        return aux.indexOf(n) === -1;
                    });
                    aux = aux.concat(diff);
                    dmin.splice(q--, 1);
                }
            }
            clustered.push(aux);
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
},{"./Cluster":2,"./ClusterLeaf":3,"./ml-euclidean-distance":7}],5:[function(require,module,exports){
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
},{"./Cluster":2,"./ClusterLeaf":3,"./ml-euclidean-distance":7}],6:[function(require,module,exports){
exports.agnes = require('./agnes');
exports.diana = require('./diana');
//exports.birch = require('./birch');
//exports.cure = require('./cure');
//exports.chameleon = require('./chameleon');
},{"./agnes":4,"./diana":5}],7:[function(require,module,exports){
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
},{}],8:[function(require,module,exports){
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

},{}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],11:[function(require,module,exports){
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

},{"./support/isBuffer":10,"_process":9,"inherits":8}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImpzL2hjbHVzdC5qcyIsImpzL2hjbHVzdC9zcmMvQ2x1c3Rlci5qcyIsImpzL2hjbHVzdC9zcmMvQ2x1c3RlckxlYWYuanMiLCJqcy9oY2x1c3Qvc3JjL2FnbmVzLmpzIiwianMvaGNsdXN0L3NyYy9kaWFuYS5qcyIsImpzL2hjbHVzdC9zcmMvaW5kZXguanMiLCJqcy9oY2x1c3Qvc3JjL21sLWV1Y2xpZGVhbi1kaXN0YW5jZS5qcyIsIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luaGVyaXRzL2luaGVyaXRzX2Jyb3dzZXIuanMiLCIuLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIuLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3N1cHBvcnQvaXNCdWZmZXJCcm93c2VyLmpzIiwiLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC91dGlsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBOzs7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIih3aW5kb3cgfHwgZ2xvYmFsKS5IQ2x1c3QgPSByZXF1aXJlKCcuL2hjbHVzdC9zcmMnKTsiLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIENsdXN0ZXIgKCkge1xuICAgIHRoaXMuY2hpbGRyZW4gPSBbXTtcbiAgICB0aGlzLmRpc3RhbmNlID0gLTE7XG4gICAgdGhpcy5pbmRleCA9IFtdO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYW4gYXJyYXkgb2YgdmFsdWVzIHdoZXJlIG1heGltdW0gZGlzdGFuY2Ugc21hbGxlciB0aGFuIHRoZSB0aHJlc2hvbGRcbiAqIEBwYXJhbSB7bnVtYmVyfSB0aHJlc2hvbGRcbiAqIEByZXR1cm4ge0FycmF5IDxDbHVzdGVyPn1cbiAqL1xuQ2x1c3Rlci5wcm90b3R5cGUuY3V0ID0gZnVuY3Rpb24gKHRocmVzaG9sZCkge1xuICAgIGlmICh0aHJlc2hvbGQgPCAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignVGhyZXNob2xkIHRvbyBzbWFsbCcpO1xuICAgIHZhciByb290ID0gbmV3IENsdXN0ZXIoKTtcbiAgICByb290LmNoaWxkcmVuID0gdGhpcy5jaGlsZHJlbjtcbiAgICByb290LmRpc3RhbmNlID0gdGhpcy5kaXN0YW5jZTtcbiAgICByb290LmluZGV4ID0gdGhpcy5pbmRleDtcbiAgICB2YXIgbGlzdCA9IFtyb290XTtcbiAgICB2YXIgYW5zID0gW107XG4gICAgd2hpbGUgKGxpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICB2YXIgYXV4ID0gbGlzdC5zaGlmdCgpO1xuICAgICAgICBpZiAodGhyZXNob2xkID49IGF1eC5kaXN0YW5jZSlcbiAgICAgICAgICAgIGFucy5wdXNoKGF1eCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGxpc3QgPSBsaXN0LmNvbmNhdChhdXguY2hpbGRyZW4pO1xuICAgIH1cbiAgICByZXR1cm4gYW5zO1xufTtcblxuLyoqXG4gKiBNZXJnZSB0aGUgbGVhdmVzIGluIHRoZSBtaW5pbXVtIHdheSB0byBoYXZlICdtaW5Hcm91cHMnIG51bWJlciBvZiBjbHVzdGVyc1xuICogQHBhcmFtIHtudW1iZXJ9IG1pbkdyb3Vwc1xuICogQHJldHVybiB7Q2x1c3Rlcn1cbiAqL1xuQ2x1c3Rlci5wcm90b3R5cGUuZ3JvdXAgPSBmdW5jdGlvbiAobWluR3JvdXBzKSB7XG4gICAgaWYgKG1pbkdyb3VwcyA8IDEpIHRocm93IG5ldyBSYW5nZUVycm9yKCdOdW1iZXIgb2YgZ3JvdXBzIHRvbyBzbWFsbCcpO1xuICAgIHZhciByb290ID0gbmV3IENsdXN0ZXIoKTtcbiAgICByb290LmNoaWxkcmVuID0gdGhpcy5jaGlsZHJlbjtcbiAgICByb290LmRpc3RhbmNlID0gdGhpcy5kaXN0YW5jZTtcbiAgICByb290LmluZGV4ID0gdGhpcy5pbmRleDtcbiAgICBpZiAobWluR3JvdXBzID09PSAxKVxuICAgICAgICByZXR1cm4gcm9vdDtcbiAgICB2YXIgbGlzdCA9IFtyb290XTtcbiAgICB2YXIgYXV4O1xuICAgIHdoaWxlIChsaXN0Lmxlbmd0aCA8IG1pbkdyb3VwcyAmJiBsaXN0Lmxlbmd0aCAhPT0gMCkge1xuICAgICAgICBhdXggPSBsaXN0LnNoaWZ0KCk7XG4gICAgICAgIGxpc3QgPSBsaXN0LmNvbmNhdChhdXguY2hpbGRyZW4pO1xuICAgIH1cbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHRocm93IG5ldyBSYW5nZUVycm9yKCdOdW1iZXIgb2YgZ3JvdXBzIHRvbyBiaWcnKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspXG4gICAgICAgIGlmIChsaXN0W2ldLmRpc3RhbmNlID09PSBhdXguZGlzdGFuY2UpIHtcbiAgICAgICAgICAgIGxpc3QuY29uY2F0KGxpc3RbaV0uY2hpbGRyZW4uc2xpY2UoMSkpO1xuICAgICAgICAgICAgbGlzdFtpXSA9IGxpc3RbaV0uY2hpbGRyZW5bMF07XG4gICAgICAgIH1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGxpc3QubGVuZ3RoOyBqKyspXG4gICAgICAgIGlmIChsaXN0W2pdLmRpc3RhbmNlICE9PSAwKSB7XG4gICAgICAgICAgICB2YXIgb2JqID0gbGlzdFtqXTtcbiAgICAgICAgICAgIG9iai5jaGlsZHJlbiA9IG9iai5pbmRleDtcbiAgICAgICAgfVxuICAgIHJldHVybiByb290O1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYWxsIGRhdGEgZm9yIG5vZGVzIGluIHRoaXMgY2x1c3RlciwgdXNpbmcgJ2RhdGEnIGFzIHRoZSBvcmlnaW5hbCBhcnJheSBvZiBub2RlIGRhdGFcbiAqIEBwYXJhbSB7QXJyYXkgPE9iamVjdD59IGRhdGFcbiAqIEByZXR1cm4ge0FycmF5IDxPYmplY3Q+fVxuICovXG5DbHVzdGVyLnByb3RvdHlwZS5ub2RlRGF0YSA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgdmFyIG5vZGVEYXRhID0gW10sXG4gICAgICAgIG4gPSB0aGlzLmluZGV4Lmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKylcbiAgICAgICAgbm9kZURhdGEucHVzaChkYXRhW3RoaXMuaW5kZXhbaV0uaW5kZXhdKTtcbiAgICByZXR1cm4gbm9kZURhdGE7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IENsdXN0ZXI7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBDbHVzdGVyID0gcmVxdWlyZSgnLi9DbHVzdGVyJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuZnVuY3Rpb24gQ2x1c3RlckxlYWYgKGluZGV4KSB7XG4gICAgQ2x1c3Rlci5jYWxsKHRoaXMpO1xuICAgIHRoaXMuaW5kZXggPSBpbmRleDtcbiAgICB0aGlzLmRpc3RhbmNlID0gMDtcbiAgICB0aGlzLmNoaWxkcmVuID0gdW5kZWZpbmVkO1xufVxuXG51dGlsLmluaGVyaXRzKENsdXN0ZXJMZWFmLCBDbHVzdGVyKTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkYXRhIGZvciB0aGUgbm9kZSBpbiB0aGlzIENsdXN0ZXJMZWFmLCB1c2luZyAnZGF0YScgYXMgdGhlIG9yaWdpbmFsIGFycmF5IG9mIG5vZGUgZGF0YVxuICogQHBhcmFtIHtBcnJheSA8T2JqZWN0Pn0gZGF0YVxuICogQHJldHVybiB7QXJyYXkgPE9iamVjdD59XG4gKi9cbkNsdXN0ZXJMZWFmLnByb3RvdHlwZS5ub2RlRGF0YSA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgcmV0dXJuIFtkYXRhW3RoaXMuaW5kZXhdXTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2x1c3RlckxlYWY7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBldWNsaWRlYW4gPSByZXF1aXJlKCcuL21sLWV1Y2xpZGVhbi1kaXN0YW5jZScpO1xudmFyIENsdXN0ZXJMZWFmID0gcmVxdWlyZSgnLi9DbHVzdGVyTGVhZicpO1xudmFyIENsdXN0ZXIgPSByZXF1aXJlKCcuL0NsdXN0ZXInKTtcblxuLyoqXG4gKiBAcGFyYW0gY2x1c3RlcjFcbiAqIEBwYXJhbSBjbHVzdGVyMlxuICogQHBhcmFtIGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gc2ltcGxlTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciBtID0gSW5maW5pdHk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKykge1xuICAgICAgICBmb3IgKHZhciBqID0gaTsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICB2YXIgZCA9IGRpc0Z1bihjbHVzdGVyMVtpXSwgY2x1c3RlcjJbal0pO1xuICAgICAgICAgICAgbSA9IE1hdGgubWluKGQsbSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG07XG59XG5cbi8qKlxuICogQHBhcmFtIGNsdXN0ZXIxXG4gKiBAcGFyYW0gY2x1c3RlcjJcbiAqIEBwYXJhbSBkaXNGdW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIGNvbXBsZXRlTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciBtID0gLTE7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKykge1xuICAgICAgICBmb3IgKHZhciBqID0gaTsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICB2YXIgZCA9IGRpc0Z1bihjbHVzdGVyMVtpXSwgY2x1c3RlcjJbal0pO1xuICAgICAgICAgICAgbSA9IE1hdGgubWF4KGQsbSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG07XG59XG5cbi8qKlxuICogQHBhcmFtIGNsdXN0ZXIxXG4gKiBAcGFyYW0gY2x1c3RlcjJcbiAqIEBwYXJhbSBkaXNGdW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIGF2ZXJhZ2VMaW5rKGNsdXN0ZXIxLCBjbHVzdGVyMiwgZGlzRnVuKSB7XG4gICAgdmFyIG0gPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3RlcjEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjbHVzdGVyMi5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgbSArPSBkaXNGdW4oY2x1c3RlcjFbaV0sIGNsdXN0ZXIyW2pdKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbSAvIChjbHVzdGVyMS5sZW5ndGggKiBjbHVzdGVyMi5sZW5ndGgpO1xufVxuXG4vKipcbiAqIEBwYXJhbSBjbHVzdGVyMVxuICogQHBhcmFtIGNsdXN0ZXIyXG4gKiBAcGFyYW0gZGlzRnVuXG4gKiBAcmV0dXJucyB7Kn1cbiAqL1xuZnVuY3Rpb24gY2VudHJvaWRMaW5rKGNsdXN0ZXIxLCBjbHVzdGVyMiwgZGlzRnVuKSB7XG4gICAgdmFyIHgxID0gMCxcbiAgICAgICAgeTEgPSAwLFxuICAgICAgICB4MiA9IDAsXG4gICAgICAgIHkyID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsdXN0ZXIxLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHgxICs9IGNsdXN0ZXIxW2ldWzBdO1xuICAgICAgICB5MSArPSBjbHVzdGVyMVtpXVsxXTtcbiAgICB9XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBjbHVzdGVyMi5sZW5ndGg7IGorKykge1xuICAgICAgICB4MiArPSBjbHVzdGVyMltqXVswXTtcbiAgICAgICAgeTIgKz0gY2x1c3RlcjJbal1bMV07XG4gICAgfVxuICAgIHgxIC89IGNsdXN0ZXIxLmxlbmd0aDtcbiAgICB5MSAvPSBjbHVzdGVyMS5sZW5ndGg7XG4gICAgeDIgLz0gY2x1c3RlcjIubGVuZ3RoO1xuICAgIHkyIC89IGNsdXN0ZXIyLmxlbmd0aDtcbiAgICByZXR1cm4gZGlzRnVuKFt4MSx5MV0sIFt4Mix5Ml0pO1xufVxuXG4vKipcbiAqIEBwYXJhbSBjbHVzdGVyMVxuICogQHBhcmFtIGNsdXN0ZXIyXG4gKiBAcGFyYW0gZGlzRnVuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiB3YXJkTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciB4MSA9IDAsXG4gICAgICAgIHkxID0gMCxcbiAgICAgICAgeDIgPSAwLFxuICAgICAgICB5MiA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKykge1xuICAgICAgICB4MSArPSBjbHVzdGVyMVtpXVswXTtcbiAgICAgICAgeTEgKz0gY2x1c3RlcjFbaV1bMV07XG4gICAgfVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgY2x1c3RlcjIubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgeDIgKz0gY2x1c3RlcjJbal1bMF07XG4gICAgICAgIHkyICs9IGNsdXN0ZXIyW2pdWzFdO1xuICAgIH1cbiAgICB4MSAvPSBjbHVzdGVyMS5sZW5ndGg7XG4gICAgeTEgLz0gY2x1c3RlcjEubGVuZ3RoO1xuICAgIHgyIC89IGNsdXN0ZXIyLmxlbmd0aDtcbiAgICB5MiAvPSBjbHVzdGVyMi5sZW5ndGg7XG4gICAgcmV0dXJuIGRpc0Z1bihbeDEseTFdLCBbeDIseTJdKSpjbHVzdGVyMS5sZW5ndGgqY2x1c3RlcjIubGVuZ3RoIC8gKGNsdXN0ZXIxLmxlbmd0aCtjbHVzdGVyMi5sZW5ndGgpO1xufVxuXG52YXIgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgZGlzRnVuYzogZXVjbGlkZWFuLFxuICAgIGtpbmQ6ICdzaW5nbGUnLFxuICAgIHByZWNpc2lvbjogNFxufTtcblxuLyoqXG4gKiBDb250aW51b3VzbHkgbWVyZ2Ugbm9kZXMgdGhhdCBoYXZlIHRoZSBsZWFzdCBkaXNzaW1pbGFyaXR5XG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGRhdGEgLSBBcnJheSBvZiBwb2ludHMgdG8gYmUgY2x1c3RlcmVkXG4gKiBAcGFyYW0ge2pzb259IG9wdGlvbnNcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBhZ25lcyhkYXRhLCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgZm9yICh2YXIgbyBpbiBkZWZhdWx0T3B0aW9ucylcbiAgICAgICAgaWYgKCEob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShvKSkpXG4gICAgICAgICAgICBvcHRpb25zW29dID0gZGVmYXVsdE9wdGlvbnNbb107XG4gICAgdmFyIGxlbiA9IGRhdGEubGVuZ3RoO1xuXG4gICAgLy8gYWxsb3dzIHRvIHVzZSBhIHN0cmluZyBvciBhIGdpdmVuIGZ1bmN0aW9uXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zLmtpbmQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgc3dpdGNoIChvcHRpb25zLmtpbmQpIHtcbiAgICAgICAgICAgIGNhc2UgJ3NpbmdsZSc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gc2ltcGxlTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2NvbXBsZXRlJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSBjb21wbGV0ZUxpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdhdmVyYWdlJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSBhdmVyYWdlTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2NlbnRyb2lkJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSBjZW50cm9pZExpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd3YXJkJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSB3YXJkTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1Vua25vd24ga2luZCBvZiBzaW1pbGFyaXR5Jyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMua2luZCAhPT0gXCJmdW5jdGlvblwiKVxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmRlZmluZWQga2luZCBvZiBzaW1pbGFyaXR5Jyk7XG5cbiAgICAvLyBDcmVhdGUgYSBsaXN0IG9mIENsdXN0ZXJMZWFmIG9iamVjdHM7IG9uZSBmb3IgZXZlcnkgbm9kZS5cbiAgICAvLyBUaGlzIGJlY29tZXMgb3VyIHdvcmtpbmcgbGlzdCBvZiB0aGluZ3Mgd2UgbmVlZCB0byBhZ2dsb21lcmF0aXZlbHkgY2x1c3Rlci5cbiAgICB2YXIgbGlzdCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICBsaXN0LnB1c2gobmV3IENsdXN0ZXJMZWFmKGkpKTtcbiAgICB9XG4gICAgdmFyIG1pbiAgPSBJbmZpbml0eSxcbiAgICAgICAgZCA9IHt9LFxuICAgICAgICBkaXMgPSAwO1xuICBcbiAgICAvLyBXaGVuIHRoZSB3b3JraW5nIGxpc3QgY29udGFpbnMgb25seSBvbmUgaXRlbSAob25lIENsdXN0ZXIgb2JqZWN0KSwgd2UncmUgZG9uZS5cbiAgICB3aGlsZSAobGlzdC5sZW5ndGggPiAxKSB7XG4gICAgICBcbiAgICAgICAgLy8gRmluZCB0aGUgbWluaW11bSBkaXN0YW5jZSBhbW9uZyBhbGwgcGFpcnMgb2YgdGhpbmdzIHRoYXQgc3RpbGwgbmVlZCB0byBiZSBjbHVzdGVyZWQuXG4gICAgICAgIGQgPSB7fTtcbiAgICAgICAgbWluID0gSW5maW5pdHk7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbGlzdC5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgZm9yICh2YXIgayA9IGogKyAxOyBrIDwgbGlzdC5sZW5ndGg7IGsrKykge1xuICAgICAgICAgICAgICAgIHZhciBmRGF0YSA9IGxpc3Rbal0ubm9kZURhdGEoZGF0YSksIFxuICAgICAgICAgICAgICAgICAgICBzRGF0YSA9IGxpc3Rba10ubm9kZURhdGEoZGF0YSk7XG4gICAgICAgICAgICAgICAgZGlzID0gb3B0aW9ucy5raW5kKGZEYXRhLCBzRGF0YSwgb3B0aW9ucy5kaXNGdW5jKS50b0ZpeGVkKG9wdGlvbnMucHJlY2lzaW9uKTtcbiAgICAgICAgICAgICAgICBpZiAoZGlzIGluIGQpIHtcbiAgICAgICAgICAgICAgICAgICAgZFtkaXNdLnB1c2goW2xpc3Rbal0sIGxpc3Rba11dKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGRbZGlzXSA9IFtbbGlzdFtqXSwgbGlzdFtrXV1dO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtaW4gPSBNYXRoLm1pbihkaXMsIG1pbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDbHVzdGVyIHRoZSBDbHVzdGVyTGVhZidzIGFuZC9vciBDbHVzdGVyJ3MgZm9yIHRoZSBsaW5rcyBhdCB0aGlzIG1pbmltdW0gZGlzdGFuY2UuXG4gICAgICAgIHZhciBkbWluID0gZFttaW4udG9GaXhlZChvcHRpb25zLnByZWNpc2lvbildO1xuICAgICAgICB2YXIgY2x1c3RlcmVkID0gW107XG4gICAgICAgIHZhciBhdXg7XG4gICAgICAgIHdoaWxlIChkbWluLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF1eCA9IGRtaW4uc2hpZnQoKTtcbiAgICAgICAgICAgIGZvciAodmFyIHEgPSAwOyBxIDwgZG1pbi5sZW5ndGg7IHErKykge1xuICAgICAgICAgICAgICAgIHZhciBpbnQgPSBkbWluW3FdLmZpbHRlcihmdW5jdGlvbihuKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gYXV4LmluZGV4T2YobikgIT09IC0xO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGlmIChpbnQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZGlmZiA9IGRtaW5bcV0uZmlsdGVyKGZ1bmN0aW9uKG4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBhdXguaW5kZXhPZihuKSA9PT0gLTE7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBhdXggPSBhdXguY29uY2F0KGRpZmYpO1xuICAgICAgICAgICAgICAgICAgICBkbWluLnNwbGljZShxLS0sIDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNsdXN0ZXJlZC5wdXNoKGF1eCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDcmVhdGUgYSBuZXcgQ2x1c3RlciBvYmplY3QgZm9yIHRoZSBjbHVzdGVycyB3ZSBqdXN0IGNyZWF0ZWRcbiAgICAgICAgZm9yICh2YXIgaWkgPSAwOyBpaSA8IGNsdXN0ZXJlZC5sZW5ndGg7IGlpKyspIHtcbiAgICAgICAgICAgIHZhciBvYmogPSBuZXcgQ2x1c3RlcigpO1xuICAgICAgICAgICAgb2JqLmNoaWxkcmVuID0gY2x1c3RlcmVkW2lpXS5jb25jYXQoKTtcbiAgICAgICAgICAgIG9iai5kaXN0YW5jZSA9IG1pbjtcbiAgICAgICAgICAgIG9iai5pbmRleCA9IFtdO1xuICAgICAgICAgICAgLy8gR2x1ZSB0aGUgaW5kZXhlcyBmb3IgYWxsIGNoaWxkcmVuIHRvZ2V0aGVyIGludG8gb25lIGJpZyBpbmRleCBmb3IgdGhpcyBDbHVzdGVyLlxuICAgICAgICAgICAgLy8gVGhlIC5pbmRleCBzaG91bGQgYWx3YXlzIGxpc3QgYWxsIG5vZGVzIHRoYXQgYXJlIHVuZGVybmVhdGggdGhpcyBwYXJ0aWN1bGFyIENsdXN0ZXIuXG4gICAgICAgICAgICBmb3IgKHZhciBqaiA9IDA7IGpqIDwgY2x1c3RlcmVkW2lpXS5sZW5ndGg7IGpqKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoY2x1c3RlcmVkW2lpXVtqal0gaW5zdGFuY2VvZiBDbHVzdGVyTGVhZilcbiAgICAgICAgICAgICAgICAgICAgb2JqLmluZGV4LnB1c2goY2x1c3RlcmVkW2lpXVtqal0pO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgb2JqLmluZGV4ID0gb2JqLmluZGV4LmNvbmNhdChjbHVzdGVyZWRbaWldW2pqXS5pbmRleCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gRGVsZXRlIHRoZSBuZXdseSBjbHVzdGVyZWQgQ2x1c3RlckxlYWYvQ2x1c3RlciBmcm9tIHRoZSB3b3JraW5nIGxpc3Qgb2YgdGhpbmdzIHRoYXRcbiAgICAgICAgICAgICAgICAvLyBzdGlsbCBuZWVkIHRvIGJlIGNsdXN0ZXJlZFxuICAgICAgICAgICAgICAgIGxpc3Quc3BsaWNlKChsaXN0LmluZGV4T2YoY2x1c3RlcmVkW2lpXVtqal0pKSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsaXN0LnB1c2gob2JqKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbGlzdFswXTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBhZ25lczsiLCIndXNlIHN0cmljdCc7XG5cbnZhciBldWNsaWRlYW4gPSByZXF1aXJlKCcuL21sLWV1Y2xpZGVhbi1kaXN0YW5jZScpO1xudmFyIENsdXN0ZXJMZWFmID0gcmVxdWlyZSgnLi9DbHVzdGVyTGVhZicpO1xudmFyIENsdXN0ZXIgPSByZXF1aXJlKCcuL0NsdXN0ZXInKTtcblxuLyoqXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGNsdXN0ZXIxXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGNsdXN0ZXIyXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkaXNGdW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIHNpbXBsZUxpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgbSA9IDEwZTEwMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsdXN0ZXIxLmxlbmd0aDsgaSsrKVxuICAgICAgICBmb3IgKHZhciBqID0gaTsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICB2YXIgZCA9IGRpc0Z1bihjbHVzdGVyMVtpXSwgY2x1c3RlcjJbal0pO1xuICAgICAgICAgICAgbSA9IE1hdGgubWluKGQsbSk7XG4gICAgICAgIH1cbiAgICByZXR1cm4gbTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGNsdXN0ZXIxXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGNsdXN0ZXIyXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkaXNGdW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIGNvbXBsZXRlTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciBtID0gLTE7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKylcbiAgICAgICAgZm9yICh2YXIgaiA9IGk7IGogPCBjbHVzdGVyMi5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgdmFyIGQgPSBkaXNGdW4oY2x1c3RlcjFbaV0sIGNsdXN0ZXIyW2pdKTtcbiAgICAgICAgICAgIG0gPSBNYXRoLm1heChkLG0pO1xuICAgICAgICB9XG4gICAgcmV0dXJuIG07XG59XG5cbi8qKlxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBjbHVzdGVyMVxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBjbHVzdGVyMlxuICogQHBhcmFtIHtmdW5jdGlvbn0gZGlzRnVuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiBhdmVyYWdlTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciBtID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsdXN0ZXIxLmxlbmd0aDsgaSsrKVxuICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKVxuICAgICAgICAgICAgbSArPSBkaXNGdW4oY2x1c3RlcjFbaV0sIGNsdXN0ZXIyW2pdKTtcbiAgICByZXR1cm4gbSAvIChjbHVzdGVyMS5sZW5ndGggKiBjbHVzdGVyMi5sZW5ndGgpO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gY2x1c3RlcjFcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gY2x1c3RlcjJcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gY2VudHJvaWRMaW5rKGNsdXN0ZXIxLCBjbHVzdGVyMiwgZGlzRnVuKSB7XG4gICAgdmFyIHgxID0gMCxcbiAgICAgICAgeTEgPSAwLFxuICAgICAgICB4MiA9IDAsXG4gICAgICAgIHkyID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsdXN0ZXIxLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHgxICs9IGNsdXN0ZXIxW2ldWzBdO1xuICAgICAgICB5MSArPSBjbHVzdGVyMVtpXVsxXTtcbiAgICB9XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBjbHVzdGVyMi5sZW5ndGg7IGorKykge1xuICAgICAgICB4MiArPSBjbHVzdGVyMltqXVswXTtcbiAgICAgICAgeTIgKz0gY2x1c3RlcjJbal1bMV07XG4gICAgfVxuICAgIHgxIC89IGNsdXN0ZXIxLmxlbmd0aDtcbiAgICB5MSAvPSBjbHVzdGVyMS5sZW5ndGg7XG4gICAgeDIgLz0gY2x1c3RlcjIubGVuZ3RoO1xuICAgIHkyIC89IGNsdXN0ZXIyLmxlbmd0aDtcbiAgICByZXR1cm4gZGlzRnVuKFt4MSx5MV0sIFt4Mix5Ml0pO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gY2x1c3RlcjFcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gY2x1c3RlcjJcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gd2FyZExpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgeDEgPSAwLFxuICAgICAgICB5MSA9IDAsXG4gICAgICAgIHgyID0gMCxcbiAgICAgICAgeTIgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3RlcjEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgeDEgKz0gY2x1c3RlcjFbaV1bMF07XG4gICAgICAgIHkxICs9IGNsdXN0ZXIxW2ldWzFdO1xuICAgIH1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIHgyICs9IGNsdXN0ZXIyW2pdWzBdO1xuICAgICAgICB5MiArPSBjbHVzdGVyMltqXVsxXTtcbiAgICB9XG4gICAgeDEgLz0gY2x1c3RlcjEubGVuZ3RoO1xuICAgIHkxIC89IGNsdXN0ZXIxLmxlbmd0aDtcbiAgICB4MiAvPSBjbHVzdGVyMi5sZW5ndGg7XG4gICAgeTIgLz0gY2x1c3RlcjIubGVuZ3RoO1xuICAgIHJldHVybiBkaXNGdW4oW3gxLHkxXSwgW3gyLHkyXSkqY2x1c3RlcjEubGVuZ3RoKmNsdXN0ZXIyLmxlbmd0aCAvIChjbHVzdGVyMS5sZW5ndGgrY2x1c3RlcjIubGVuZ3RoKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBtb3N0IGRpc3RhbnQgcG9pbnQgYW5kIGhpcyBkaXN0YW5jZVxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBzcGxpdHRpbmcgLSBDbHVzdGVycyB0byBzcGxpdFxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBkYXRhIC0gT3JpZ2luYWwgZGF0YVxuICogQHBhcmFtIHtmdW5jdGlvbn0gZGlzRnVuIC0gRGlzdGFuY2UgZnVuY3Rpb25cbiAqIEByZXR1cm5zIHt7ZDogbnVtYmVyLCBwOiBudW1iZXJ9fSAtIGQ6IG1heGltdW0gZGlmZmVyZW5jZSBiZXR3ZWVuIHBvaW50cywgcDogdGhlIHBvaW50IG1vcmUgZGlzdGFudFxuICovXG5mdW5jdGlvbiBkaWZmKHNwbGl0dGluZywgZGF0YSwgZGlzRnVuKSB7XG4gICAgdmFyIGFucyA9IHtcbiAgICAgICAgZDowLFxuICAgICAgICBwOjBcbiAgICB9O1xuXG4gICAgdmFyIENpID0gbmV3IEFycmF5KHNwbGl0dGluZ1swXS5sZW5ndGgpO1xuICAgIGZvciAodmFyIGUgPSAwOyBlIDwgc3BsaXR0aW5nWzBdLmxlbmd0aDsgZSsrKVxuICAgICAgICBDaVtlXSA9IGRhdGFbc3BsaXR0aW5nWzBdW2VdXTtcbiAgICB2YXIgQ2ogPSBuZXcgQXJyYXkoc3BsaXR0aW5nWzFdLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgZiA9IDA7IGYgPCBzcGxpdHRpbmdbMV0ubGVuZ3RoOyBmKyspXG4gICAgICAgIENqW2ZdID0gZGF0YVtzcGxpdHRpbmdbMV1bZl1dO1xuXG4gICAgdmFyIGRpc3QsIG5kaXN0O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgQ2kubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZGlzdCA9IDA7XG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgQ2kubGVuZ3RoOyBqKyspXG4gICAgICAgICAgICBpZiAoaSAhPT0gailcbiAgICAgICAgICAgICAgICBkaXN0ICs9IGRpc0Z1bihDaVtpXSwgQ2lbal0pO1xuICAgICAgICBkaXN0IC89IChDaS5sZW5ndGggLSAxKTtcbiAgICAgICAgbmRpc3QgPSAwO1xuICAgICAgICBmb3IgKHZhciBrID0gMDsgayA8IENqLmxlbmd0aDsgaysrKVxuICAgICAgICAgICAgbmRpc3QgKz0gZGlzRnVuKENpW2ldLCBDaltrXSk7XG4gICAgICAgIG5kaXN0IC89IENqLmxlbmd0aDtcbiAgICAgICAgaWYgKChkaXN0IC0gbmRpc3QpID4gYW5zLmQpIHtcbiAgICAgICAgICAgIGFucy5kID0gKGRpc3QgLSBuZGlzdCk7XG4gICAgICAgICAgICBhbnMucCA9IGk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFucztcbn1cblxudmFyIGRlZmF1bHRPcHRpb25zID0ge1xuICAgIGRpc3Q6IGV1Y2xpZGVhbixcbiAgICBraW5kOiAnc2luZ2xlJ1xufTtcblxuLyoqXG4gKiBJbnRyYS1jbHVzdGVyIGRpc3RhbmNlXG4gKiBAcGFyYW0ge0FycmF5fSBpbmRleFxuICogQHBhcmFtIHtBcnJheX0gZGF0YVxuICogQHBhcmFtIHtmdW5jdGlvbn0gZGlzRnVuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiBpbnRyRGlzdChpbmRleCwgZGF0YSwgZGlzRnVuKSB7XG4gICAgdmFyIGRpc3QgPSAwLFxuICAgICAgICBjb3VudCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbmRleC5sZW5ndGg7IGkrKylcbiAgICAgICAgZm9yICh2YXIgaiA9IGk7IGogPCBpbmRleC5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgZGlzdCArPSBkaXNGdW4oZGF0YVtpbmRleFtpXS5pbmRleF0sIGRhdGFbaW5kZXhbal0uaW5kZXhdKTtcbiAgICAgICAgICAgIGNvdW50KytcbiAgICAgICAgfVxuICAgIHJldHVybiBkaXN0IC8gY291bnQ7XG59XG5cbi8qKlxuICogU3BsaXRzIHRoZSBoaWdoZXIgbGV2ZWwgY2x1c3RlcnNcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gZGF0YSAtIEFycmF5IG9mIHBvaW50cyB0byBiZSBjbHVzdGVyZWRcbiAqIEBwYXJhbSB7anNvbn0gb3B0aW9uc1xuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIGRpYW5hKGRhdGEsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICBmb3IgKHZhciBvIGluIGRlZmF1bHRPcHRpb25zKVxuICAgICAgICBpZiAoIShvcHRpb25zLmhhc093blByb3BlcnR5KG8pKSlcbiAgICAgICAgICAgIG9wdGlvbnNbb10gPSBkZWZhdWx0T3B0aW9uc1tvXTtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMua2luZCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBzd2l0Y2ggKG9wdGlvbnMua2luZCkge1xuICAgICAgICAgICAgY2FzZSAnc2luZ2xlJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSBzaW1wbGVMaW5rO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnY29tcGxldGUnOlxuICAgICAgICAgICAgICAgIG9wdGlvbnMua2luZCA9IGNvbXBsZXRlTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2F2ZXJhZ2UnOlxuICAgICAgICAgICAgICAgIG9wdGlvbnMua2luZCA9IGF2ZXJhZ2VMaW5rO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnY2VudHJvaWQnOlxuICAgICAgICAgICAgICAgIG9wdGlvbnMua2luZCA9IGNlbnRyb2lkTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ3dhcmQnOlxuICAgICAgICAgICAgICAgIG9wdGlvbnMua2luZCA9IHdhcmRMaW5rO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignVW5rbm93biBraW5kIG9mIHNpbWlsYXJpdHknKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucy5raW5kICE9PSBcImZ1bmN0aW9uXCIpXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1VuZGVmaW5lZCBraW5kIG9mIHNpbWlsYXJpdHknKTtcbiAgICB2YXIgdHJlZSA9IG5ldyBDbHVzdGVyKCk7XG4gICAgdHJlZS5jaGlsZHJlbiA9IG5ldyBBcnJheShkYXRhLmxlbmd0aCk7XG4gICAgdHJlZS5pbmRleCA9IG5ldyBBcnJheShkYXRhLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgaW5kID0gMDsgaW5kIDwgZGF0YS5sZW5ndGg7IGluZCsrKSB7XG4gICAgICAgIHRyZWUuY2hpbGRyZW5baW5kXSA9IG5ldyBDbHVzdGVyTGVhZihpbmQpO1xuICAgICAgICB0cmVlLmluZGV4W2luZF0gPSBuZXcgQ2x1c3RlckxlYWYoaW5kKTtcbiAgICB9XG5cbiAgICB0cmVlLmRpc3RhbmNlID0gaW50ckRpc3QodHJlZS5pbmRleCwgZGF0YSwgb3B0aW9ucy5kaXN0KTtcbiAgICB2YXIgbSwgTSwgY2xJZCxcbiAgICAgICAgZGlzdCwgcmViZWw7XG4gICAgdmFyIGxpc3QgPSBbdHJlZV07XG4gICAgd2hpbGUgKGxpc3QubGVuZ3RoID4gMCkge1xuICAgICAgICBNID0gMDtcbiAgICAgICAgY2xJZCA9IDA7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbSA9IDA7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGxpc3RbaV0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBsID0gKGogKyAxKTsgbCA8IGxpc3RbaV0ubGVuZ3RoOyBsKyspIHtcbiAgICAgICAgICAgICAgICAgICAgbSA9IE1hdGgubWF4KG9wdGlvbnMuZGlzdChkYXRhW2xpc3RbaV0uaW5kZXhbal0uaW5kZXhdLCBkYXRhW2xpc3RbaV0uaW5kZXhbbF0uaW5kZXhdKSwgbSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG0gPiBNKSB7XG4gICAgICAgICAgICAgICAgTSA9IG07XG4gICAgICAgICAgICAgICAgY2xJZCA9IGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgTSA9IDA7XG4gICAgICAgIGlmIChsaXN0W2NsSWRdLmluZGV4Lmxlbmd0aCA9PT0gMikge1xuICAgICAgICAgICAgbGlzdFtjbElkXS5jaGlsZHJlbiA9IFtsaXN0W2NsSWRdLmluZGV4WzBdLCBsaXN0W2NsSWRdLmluZGV4WzFdXTtcbiAgICAgICAgICAgIGxpc3RbY2xJZF0uZGlzdGFuY2UgPSBvcHRpb25zLmRpc3QoZGF0YVtsaXN0W2NsSWRdLmluZGV4WzBdLmluZGV4XSwgZGF0YVtsaXN0W2NsSWRdLmluZGV4WzFdLmluZGV4XSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobGlzdFtjbElkXS5pbmRleC5sZW5ndGggPT09IDMpIHtcbiAgICAgICAgICAgIGxpc3RbY2xJZF0uY2hpbGRyZW4gPSBbbGlzdFtjbElkXS5pbmRleFswXSwgbGlzdFtjbElkXS5pbmRleFsxXSwgbGlzdFtjbElkXS5pbmRleFsyXV07XG4gICAgICAgICAgICB2YXIgZCA9IFtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRpc3QoZGF0YVtsaXN0W2NsSWRdLmluZGV4WzBdLmluZGV4XSwgZGF0YVtsaXN0W2NsSWRdLmluZGV4WzFdLmluZGV4XSksXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5kaXN0KGRhdGFbbGlzdFtjbElkXS5pbmRleFsxXS5pbmRleF0sIGRhdGFbbGlzdFtjbElkXS5pbmRleFsyXS5pbmRleF0pXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgbGlzdFtjbElkXS5kaXN0YW5jZSA9IChkWzBdICsgZFsxXSkgLyAyO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIEMgPSBuZXcgQ2x1c3RlcigpO1xuICAgICAgICAgICAgdmFyIHNHID0gbmV3IENsdXN0ZXIoKTtcbiAgICAgICAgICAgIHZhciBzcGxpdHRpbmcgPSBbbmV3IEFycmF5KGxpc3RbY2xJZF0uaW5kZXgubGVuZ3RoKSwgW11dO1xuICAgICAgICAgICAgZm9yICh2YXIgc3BsID0gMDsgc3BsIDwgc3BsaXR0aW5nWzBdLmxlbmd0aDsgc3BsKyspXG4gICAgICAgICAgICAgICAgc3BsaXR0aW5nWzBdW3NwbF0gPSBzcGw7XG4gICAgICAgICAgICBmb3IgKHZhciBpaSA9IDA7IGlpIDwgc3BsaXR0aW5nWzBdLmxlbmd0aDsgaWkrKykge1xuICAgICAgICAgICAgICAgIGRpc3QgPSAwO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGpqID0gMDsgamogPCBzcGxpdHRpbmdbMF0ubGVuZ3RoOyBqaisrKVxuICAgICAgICAgICAgICAgICAgICBpZiAoaWkgIT09IGpqKVxuICAgICAgICAgICAgICAgICAgICAgICAgZGlzdCArPSBvcHRpb25zLmRpc3QoZGF0YVtsaXN0W2NsSWRdLmluZGV4W3NwbGl0dGluZ1swXVtqal1dLmluZGV4XSwgZGF0YVtsaXN0W2NsSWRdLmluZGV4W3NwbGl0dGluZ1swXVtpaV1dLmluZGV4XSk7XG4gICAgICAgICAgICAgICAgZGlzdCAvPSAoc3BsaXR0aW5nWzBdLmxlbmd0aCAtIDEpO1xuICAgICAgICAgICAgICAgIGlmIChkaXN0ID4gTSkge1xuICAgICAgICAgICAgICAgICAgICBNID0gZGlzdDtcbiAgICAgICAgICAgICAgICAgICAgcmViZWwgPSBpaTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzcGxpdHRpbmdbMV0gPSBbcmViZWxdO1xuICAgICAgICAgICAgc3BsaXR0aW5nWzBdLnNwbGljZShyZWJlbCwgMSk7XG4gICAgICAgICAgICBkaXN0ID0gZGlmZihzcGxpdHRpbmcsIGRhdGEsIG9wdGlvbnMuZGlzdCk7XG4gICAgICAgICAgICB3aGlsZSAoZGlzdC5kID4gMCkge1xuICAgICAgICAgICAgICAgIHNwbGl0dGluZ1sxXS5wdXNoKHNwbGl0dGluZ1swXVtkaXN0LnBdKTtcbiAgICAgICAgICAgICAgICBzcGxpdHRpbmdbMF0uc3BsaWNlKGRpc3QucCwgMSk7XG4gICAgICAgICAgICAgICAgZGlzdCA9IGRpZmYoc3BsaXR0aW5nLCBkYXRhLCBvcHRpb25zLmRpc3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGZEYXRhID0gbmV3IEFycmF5KHNwbGl0dGluZ1swXS5sZW5ndGgpO1xuICAgICAgICAgICAgQy5pbmRleCA9IG5ldyBBcnJheShzcGxpdHRpbmdbMF0ubGVuZ3RoKTtcbiAgICAgICAgICAgIGZvciAodmFyIGUgPSAwOyBlIDwgZkRhdGEubGVuZ3RoOyBlKyspIHtcbiAgICAgICAgICAgICAgICBmRGF0YVtlXSA9IGRhdGFbbGlzdFtjbElkXS5pbmRleFtzcGxpdHRpbmdbMF1bZV1dLmluZGV4XTtcbiAgICAgICAgICAgICAgICBDLmluZGV4W2VdID0gbGlzdFtjbElkXS5pbmRleFtzcGxpdHRpbmdbMF1bZV1dO1xuICAgICAgICAgICAgICAgIEMuY2hpbGRyZW5bZV0gPSBsaXN0W2NsSWRdLmluZGV4W3NwbGl0dGluZ1swXVtlXV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgc0RhdGEgPSBuZXcgQXJyYXkoc3BsaXR0aW5nWzFdLmxlbmd0aCk7XG4gICAgICAgICAgICBzRy5pbmRleCA9IG5ldyBBcnJheShzcGxpdHRpbmdbMV0ubGVuZ3RoKTtcbiAgICAgICAgICAgIGZvciAodmFyIGYgPSAwOyBmIDwgc0RhdGEubGVuZ3RoOyBmKyspIHtcbiAgICAgICAgICAgICAgICBzRGF0YVtmXSA9IGRhdGFbbGlzdFtjbElkXS5pbmRleFtzcGxpdHRpbmdbMV1bZl1dLmluZGV4XTtcbiAgICAgICAgICAgICAgICBzRy5pbmRleFtmXSA9IGxpc3RbY2xJZF0uaW5kZXhbc3BsaXR0aW5nWzFdW2ZdXTtcbiAgICAgICAgICAgICAgICBzRy5jaGlsZHJlbltmXSA9IGxpc3RbY2xJZF0uaW5kZXhbc3BsaXR0aW5nWzFdW2ZdXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIEMuZGlzdGFuY2UgPSBpbnRyRGlzdChDLmluZGV4LCBkYXRhLCBvcHRpb25zLmRpc3QpO1xuICAgICAgICAgICAgc0cuZGlzdGFuY2UgPSBpbnRyRGlzdChzRy5pbmRleCwgZGF0YSwgb3B0aW9ucy5kaXN0KTtcbiAgICAgICAgICAgIGxpc3QucHVzaChDKTtcbiAgICAgICAgICAgIGxpc3QucHVzaChzRyk7XG4gICAgICAgICAgICBsaXN0W2NsSWRdLmNoaWxkcmVuID0gW0MsIHNHXTtcbiAgICAgICAgfVxuICAgICAgICBsaXN0LnNwbGljZShjbElkLCAxKTtcbiAgICB9XG4gICAgcmV0dXJuIHRyZWU7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZGlhbmE7IiwiZXhwb3J0cy5hZ25lcyA9IHJlcXVpcmUoJy4vYWduZXMnKTtcbmV4cG9ydHMuZGlhbmEgPSByZXF1aXJlKCcuL2RpYW5hJyk7XG4vL2V4cG9ydHMuYmlyY2ggPSByZXF1aXJlKCcuL2JpcmNoJyk7XG4vL2V4cG9ydHMuY3VyZSA9IHJlcXVpcmUoJy4vY3VyZScpO1xuLy9leHBvcnRzLmNoYW1lbGVvbiA9IHJlcXVpcmUoJy4vY2hhbWVsZW9uJyk7IiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBtbC1ldWNsaWRlYW4tZGlzdGFuY2Vcbi8vIEZyb206IGh0dHBzOi8vZ2l0aHViLmNvbS9tbGpzL2V1Y2xpZGVhbi1kaXN0YW5jZVxuLy8gTGljZW5zZTogTUlUXG5cbmZ1bmN0aW9uIHNxdWFyZWRFdWNsaWRlYW4ocCwgcSkge1xuICAgIHZhciBkID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHAubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZCArPSAocFtpXSAtIHFbaV0pICogKHBbaV0gLSBxW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIGQ7XG59XG5cbmZ1bmN0aW9uIGV1Y2xpZGVhbihwLCBxKSB7XG4gICAgcmV0dXJuIE1hdGguc3FydChzcXVhcmVkRXVjbGlkZWFuKHAsIHEpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBldWNsaWRlYW47XG5ldWNsaWRlYW4uc3F1YXJlZCA9IHNxdWFyZWRFdWNsaWRlYW47IiwiaWYgKHR5cGVvZiBPYmplY3QuY3JlYXRlID09PSAnZnVuY3Rpb24nKSB7XG4gIC8vIGltcGxlbWVudGF0aW9uIGZyb20gc3RhbmRhcmQgbm9kZS5qcyAndXRpbCcgbW9kdWxlXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICBjdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoc3VwZXJDdG9yLnByb3RvdHlwZSwge1xuICAgICAgY29uc3RydWN0b3I6IHtcbiAgICAgICAgdmFsdWU6IGN0b3IsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59IGVsc2Uge1xuICAvLyBvbGQgc2Nob29sIHNoaW0gZm9yIG9sZCBicm93c2Vyc1xuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgdmFyIFRlbXBDdG9yID0gZnVuY3Rpb24gKCkge31cbiAgICBUZW1wQ3Rvci5wcm90b3R5cGUgPSBzdXBlckN0b3IucHJvdG90eXBlXG4gICAgY3Rvci5wcm90b3R5cGUgPSBuZXcgVGVtcEN0b3IoKVxuICAgIGN0b3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY3RvclxuICB9XG59XG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gc2V0VGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNCdWZmZXIoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgdHlwZW9mIGFyZyA9PT0gJ29iamVjdCdcbiAgICAmJiB0eXBlb2YgYXJnLmNvcHkgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLmZpbGwgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLnJlYWRVSW50OCA9PT0gJ2Z1bmN0aW9uJztcbn0iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIGZvcm1hdFJlZ0V4cCA9IC8lW3NkaiVdL2c7XG5leHBvcnRzLmZvcm1hdCA9IGZ1bmN0aW9uKGYpIHtcbiAgaWYgKCFpc1N0cmluZyhmKSkge1xuICAgIHZhciBvYmplY3RzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG9iamVjdHMucHVzaChpbnNwZWN0KGFyZ3VtZW50c1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0cy5qb2luKCcgJyk7XG4gIH1cblxuICB2YXIgaSA9IDE7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG4gIHZhciBzdHIgPSBTdHJpbmcoZikucmVwbGFjZShmb3JtYXRSZWdFeHAsIGZ1bmN0aW9uKHgpIHtcbiAgICBpZiAoeCA9PT0gJyUlJykgcmV0dXJuICclJztcbiAgICBpZiAoaSA+PSBsZW4pIHJldHVybiB4O1xuICAgIHN3aXRjaCAoeCkge1xuICAgICAgY2FzZSAnJXMnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclZCc6IHJldHVybiBOdW1iZXIoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVqJzpcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnc1tpKytdKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbiAgfSk7XG4gIGZvciAodmFyIHggPSBhcmdzW2ldOyBpIDwgbGVuOyB4ID0gYXJnc1srK2ldKSB7XG4gICAgaWYgKGlzTnVsbCh4KSB8fCAhaXNPYmplY3QoeCkpIHtcbiAgICAgIHN0ciArPSAnICcgKyB4O1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gJyAnICsgaW5zcGVjdCh4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn07XG5cblxuLy8gTWFyayB0aGF0IGEgbWV0aG9kIHNob3VsZCBub3QgYmUgdXNlZC5cbi8vIFJldHVybnMgYSBtb2RpZmllZCBmdW5jdGlvbiB3aGljaCB3YXJucyBvbmNlIGJ5IGRlZmF1bHQuXG4vLyBJZiAtLW5vLWRlcHJlY2F0aW9uIGlzIHNldCwgdGhlbiBpdCBpcyBhIG5vLW9wLlxuZXhwb3J0cy5kZXByZWNhdGUgPSBmdW5jdGlvbihmbiwgbXNnKSB7XG4gIC8vIEFsbG93IGZvciBkZXByZWNhdGluZyB0aGluZ3MgaW4gdGhlIHByb2Nlc3Mgb2Ygc3RhcnRpbmcgdXAuXG4gIGlmIChpc1VuZGVmaW5lZChnbG9iYWwucHJvY2VzcykpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZXByZWNhdGUoZm4sIG1zZykuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiAgaWYgKHByb2Nlc3Mubm9EZXByZWNhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHZhciB3YXJuZWQgPSBmYWxzZTtcbiAgZnVuY3Rpb24gZGVwcmVjYXRlZCgpIHtcbiAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgaWYgKHByb2Nlc3MudGhyb3dEZXByZWNhdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy50cmFjZURlcHJlY2F0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUudHJhY2UobXNnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgICAgIH1cbiAgICAgIHdhcm5lZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgcmV0dXJuIGRlcHJlY2F0ZWQ7XG59O1xuXG5cbnZhciBkZWJ1Z3MgPSB7fTtcbnZhciBkZWJ1Z0Vudmlyb247XG5leHBvcnRzLmRlYnVnbG9nID0gZnVuY3Rpb24oc2V0KSB7XG4gIGlmIChpc1VuZGVmaW5lZChkZWJ1Z0Vudmlyb24pKVxuICAgIGRlYnVnRW52aXJvbiA9IHByb2Nlc3MuZW52Lk5PREVfREVCVUcgfHwgJyc7XG4gIHNldCA9IHNldC50b1VwcGVyQ2FzZSgpO1xuICBpZiAoIWRlYnVnc1tzZXRdKSB7XG4gICAgaWYgKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNldCArICdcXFxcYicsICdpJykudGVzdChkZWJ1Z0Vudmlyb24pKSB7XG4gICAgICB2YXIgcGlkID0gcHJvY2Vzcy5waWQ7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXNnID0gZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJXMgJWQ6ICVzJywgc2V0LCBwaWQsIG1zZyk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWJ1Z3Nbc2V0XTtcbn07XG5cblxuLyoqXG4gKiBFY2hvcyB0aGUgdmFsdWUgb2YgYSB2YWx1ZS4gVHJ5cyB0byBwcmludCB0aGUgdmFsdWUgb3V0XG4gKiBpbiB0aGUgYmVzdCB3YXkgcG9zc2libGUgZ2l2ZW4gdGhlIGRpZmZlcmVudCB0eXBlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcHJpbnQgb3V0LlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QgdGhhdCBhbHRlcnMgdGhlIG91dHB1dC5cbiAqL1xuLyogbGVnYWN5OiBvYmosIHNob3dIaWRkZW4sIGRlcHRoLCBjb2xvcnMqL1xuZnVuY3Rpb24gaW5zcGVjdChvYmosIG9wdHMpIHtcbiAgLy8gZGVmYXVsdCBvcHRpb25zXG4gIHZhciBjdHggPSB7XG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogc3R5bGl6ZU5vQ29sb3JcbiAgfTtcbiAgLy8gbGVnYWN5Li4uXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIGN0eC5kZXB0aCA9IGFyZ3VtZW50c1syXTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gNCkgY3R4LmNvbG9ycyA9IGFyZ3VtZW50c1szXTtcbiAgaWYgKGlzQm9vbGVhbihvcHRzKSkge1xuICAgIC8vIGxlZ2FjeS4uLlxuICAgIGN0eC5zaG93SGlkZGVuID0gb3B0cztcbiAgfSBlbHNlIGlmIChvcHRzKSB7XG4gICAgLy8gZ290IGFuIFwib3B0aW9uc1wiIG9iamVjdFxuICAgIGV4cG9ydHMuX2V4dGVuZChjdHgsIG9wdHMpO1xuICB9XG4gIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5zaG93SGlkZGVuKSkgY3R4LnNob3dIaWRkZW4gPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5kZXB0aCkpIGN0eC5kZXB0aCA9IDI7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY29sb3JzKSkgY3R4LmNvbG9ycyA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmN1c3RvbUluc3BlY3QpKSBjdHguY3VzdG9tSW5zcGVjdCA9IHRydWU7XG4gIGlmIChjdHguY29sb3JzKSBjdHguc3R5bGl6ZSA9IHN0eWxpemVXaXRoQ29sb3I7XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgY3R4LmRlcHRoKTtcbn1cbmV4cG9ydHMuaW5zcGVjdCA9IGluc3BlY3Q7XG5cblxuLy8gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI2dyYXBoaWNzXG5pbnNwZWN0LmNvbG9ycyA9IHtcbiAgJ2JvbGQnIDogWzEsIDIyXSxcbiAgJ2l0YWxpYycgOiBbMywgMjNdLFxuICAndW5kZXJsaW5lJyA6IFs0LCAyNF0sXG4gICdpbnZlcnNlJyA6IFs3LCAyN10sXG4gICd3aGl0ZScgOiBbMzcsIDM5XSxcbiAgJ2dyZXknIDogWzkwLCAzOV0sXG4gICdibGFjaycgOiBbMzAsIDM5XSxcbiAgJ2JsdWUnIDogWzM0LCAzOV0sXG4gICdjeWFuJyA6IFszNiwgMzldLFxuICAnZ3JlZW4nIDogWzMyLCAzOV0sXG4gICdtYWdlbnRhJyA6IFszNSwgMzldLFxuICAncmVkJyA6IFszMSwgMzldLFxuICAneWVsbG93JyA6IFszMywgMzldXG59O1xuXG4vLyBEb24ndCB1c2UgJ2JsdWUnIG5vdCB2aXNpYmxlIG9uIGNtZC5leGVcbmluc3BlY3Quc3R5bGVzID0ge1xuICAnc3BlY2lhbCc6ICdjeWFuJyxcbiAgJ251bWJlcic6ICd5ZWxsb3cnLFxuICAnYm9vbGVhbic6ICd5ZWxsb3cnLFxuICAndW5kZWZpbmVkJzogJ2dyZXknLFxuICAnbnVsbCc6ICdib2xkJyxcbiAgJ3N0cmluZyc6ICdncmVlbicsXG4gICdkYXRlJzogJ21hZ2VudGEnLFxuICAvLyBcIm5hbWVcIjogaW50ZW50aW9uYWxseSBub3Qgc3R5bGluZ1xuICAncmVnZXhwJzogJ3JlZCdcbn07XG5cblxuZnVuY3Rpb24gc3R5bGl6ZVdpdGhDb2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICB2YXIgc3R5bGUgPSBpbnNwZWN0LnN0eWxlc1tzdHlsZVR5cGVdO1xuXG4gIGlmIChzdHlsZSkge1xuICAgIHJldHVybiAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzBdICsgJ20nICsgc3RyICtcbiAgICAgICAgICAgJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVsxXSArICdtJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59XG5cblxuZnVuY3Rpb24gc3R5bGl6ZU5vQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgcmV0dXJuIHN0cjtcbn1cblxuXG5mdW5jdGlvbiBhcnJheVRvSGFzaChhcnJheSkge1xuICB2YXIgaGFzaCA9IHt9O1xuXG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsLCBpZHgpIHtcbiAgICBoYXNoW3ZhbF0gPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaGFzaDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMpIHtcbiAgLy8gUHJvdmlkZSBhIGhvb2sgZm9yIHVzZXItc3BlY2lmaWVkIGluc3BlY3QgZnVuY3Rpb25zLlxuICAvLyBDaGVjayB0aGF0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFuIGluc3BlY3QgZnVuY3Rpb24gb24gaXRcbiAgaWYgKGN0eC5jdXN0b21JbnNwZWN0ICYmXG4gICAgICB2YWx1ZSAmJlxuICAgICAgaXNGdW5jdGlvbih2YWx1ZS5pbnNwZWN0KSAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcywgY3R4KTtcbiAgICBpZiAoIWlzU3RyaW5nKHJldCkpIHtcbiAgICAgIHJldCA9IGZvcm1hdFZhbHVlKGN0eCwgcmV0LCByZWN1cnNlVGltZXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gUHJpbWl0aXZlIHR5cGVzIGNhbm5vdCBoYXZlIHByb3BlcnRpZXNcbiAgdmFyIHByaW1pdGl2ZSA9IGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKTtcbiAgaWYgKHByaW1pdGl2ZSkge1xuICAgIHJldHVybiBwcmltaXRpdmU7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICB2YXIgdmlzaWJsZUtleXMgPSBhcnJheVRvSGFzaChrZXlzKTtcblxuICBpZiAoY3R4LnNob3dIaWRkZW4pIHtcbiAgICBrZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModmFsdWUpO1xuICB9XG5cbiAgLy8gSUUgZG9lc24ndCBtYWtlIGVycm9yIGZpZWxkcyBub24tZW51bWVyYWJsZVxuICAvLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvaWUvZHd3NTJzYnQodj12cy45NCkuYXNweFxuICBpZiAoaXNFcnJvcih2YWx1ZSlcbiAgICAgICYmIChrZXlzLmluZGV4T2YoJ21lc3NhZ2UnKSA+PSAwIHx8IGtleXMuaW5kZXhPZignZGVzY3JpcHRpb24nKSA+PSAwKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICAvLyBTb21lIHR5cGUgb2Ygb2JqZWN0IHdpdGhvdXQgcHJvcGVydGllcyBjYW4gYmUgc2hvcnRjdXR0ZWQuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgdmFyIG5hbWUgPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWUgKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgdmFyIG4gPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbiArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ3VuZGVmaW5lZCcsICd1bmRlZmluZWQnKTtcbiAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcbiAgfVxuICBpZiAoaXNOdW1iZXIodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG4gIGlmIChpc0Jvb2xlYW4odmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmIChpc051bGwodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0RXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuICdbJyArIEVycm9yLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSArICddJztcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB2YWx1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0ciwgZGVzYztcbiAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodmFsdWUsIGtleSkgfHwgeyB2YWx1ZTogdmFsdWVba2V5XSB9O1xuICBpZiAoZGVzYy5nZXQpIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICghaGFzT3duUHJvcGVydHkodmlzaWJsZUtleXMsIGtleSkpIHtcbiAgICBuYW1lID0gJ1snICsga2V5ICsgJ10nO1xuICB9XG4gIGlmICghc3RyKSB7XG4gICAgaWYgKGN0eC5zZWVuLmluZGV4T2YoZGVzYy52YWx1ZSkgPCAwKSB7XG4gICAgICBpZiAoaXNOdWxsKHJlY3Vyc2VUaW1lcykpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNVbmRlZmluZWQobmFtZSkpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIucmVwbGFjZSgvXFx1MDAxYlxcW1xcZFxcZD9tL2csICcnKS5sZW5ndGggKyAxO1xuICB9LCAwKTtcblxuICBpZiAobGVuZ3RoID4gNjApIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICtcbiAgICAgICAgICAgKGJhc2UgPT09ICcnID8gJycgOiBiYXNlICsgJ1xcbiAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIG91dHB1dC5qb2luKCcsXFxuICAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIGJyYWNlc1sxXTtcbiAgfVxuXG4gIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgJyAnICsgb3V0cHV0LmpvaW4oJywgJykgKyAnICcgKyBicmFjZXNbMV07XG59XG5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmV4cG9ydHMuaXNCdWZmZXIgPSByZXF1aXJlKCcuL3N1cHBvcnQvaXNCdWZmZXInKTtcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG5cbmZ1bmN0aW9uIHBhZChuKSB7XG4gIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuLnRvU3RyaW5nKDEwKSA6IG4udG9TdHJpbmcoMTApO1xufVxuXG5cbnZhciBtb250aHMgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJyxcbiAgICAgICAgICAgICAgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cbi8vIDI2IEZlYiAxNjoxOTozNFxuZnVuY3Rpb24gdGltZXN0YW1wKCkge1xuICB2YXIgZCA9IG5ldyBEYXRlKCk7XG4gIHZhciB0aW1lID0gW3BhZChkLmdldEhvdXJzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRNaW51dGVzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRTZWNvbmRzKCkpXS5qb2luKCc6Jyk7XG4gIHJldHVybiBbZC5nZXREYXRlKCksIG1vbnRoc1tkLmdldE1vbnRoKCldLCB0aW1lXS5qb2luKCcgJyk7XG59XG5cblxuLy8gbG9nIGlzIGp1c3QgYSB0aGluIHdyYXBwZXIgdG8gY29uc29sZS5sb2cgdGhhdCBwcmVwZW5kcyBhIHRpbWVzdGFtcFxuZXhwb3J0cy5sb2cgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJyVzIC0gJXMnLCB0aW1lc3RhbXAoKSwgZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSk7XG59O1xuXG5cbi8qKlxuICogSW5oZXJpdCB0aGUgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBvbmUgY29uc3RydWN0b3IgaW50byBhbm90aGVyLlxuICpcbiAqIFRoZSBGdW5jdGlvbi5wcm90b3R5cGUuaW5oZXJpdHMgZnJvbSBsYW5nLmpzIHJld3JpdHRlbiBhcyBhIHN0YW5kYWxvbmVcbiAqIGZ1bmN0aW9uIChub3Qgb24gRnVuY3Rpb24ucHJvdG90eXBlKS4gTk9URTogSWYgdGhpcyBmaWxlIGlzIHRvIGJlIGxvYWRlZFxuICogZHVyaW5nIGJvb3RzdHJhcHBpbmcgdGhpcyBmdW5jdGlvbiBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdXNpbmcgc29tZSBuYXRpdmVcbiAqIGZ1bmN0aW9ucyBhcyBwcm90b3R5cGUgc2V0dXAgdXNpbmcgbm9ybWFsIEphdmFTY3JpcHQgZG9lcyBub3Qgd29yayBhc1xuICogZXhwZWN0ZWQgZHVyaW5nIGJvb3RzdHJhcHBpbmcgKHNlZSBtaXJyb3IuanMgaW4gcjExNDkwMykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB3aGljaCBuZWVkcyB0byBpbmhlcml0IHRoZVxuICogICAgIHByb3RvdHlwZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IHN1cGVyQ3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBpbmhlcml0IHByb3RvdHlwZSBmcm9tLlxuICovXG5leHBvcnRzLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuZXhwb3J0cy5fZXh0ZW5kID0gZnVuY3Rpb24ob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCAhaXNPYmplY3QoYWRkKSkgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn07XG5cbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG4iXX0=

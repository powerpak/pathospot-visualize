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
    var m = 10e100;
    for (var i = 0; i < cluster1.length; i++)
        for (var j = i; j < cluster2.length; j++) {
            var d = disFun(cluster1[i], cluster2[j]);
            m = Math.min(d,m);
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
    for (var i = 0; i < cluster1.length; i++)
        for (var j = i; j < cluster2.length; j++) {
            var d = disFun(cluster1[i], cluster2[j]);
            m = Math.max(d,m);
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
    for (var i = 0; i < cluster1.length; i++)
        for (var j = 0; j < cluster2.length; j++)
            m += disFun(cluster1[i], cluster2[j]);
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
    kind: 'single'
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

    var list = new Array(len);
    for (var i = 0; i < data.length; i++)
        list[i] = new ClusterLeaf(i);
    var min  = 10e5,
        d = {},
        dis = 0;

    while (list.length > 1) {

        // calculates the minimum distance
        d = {};
        min = 10e5;
        for (var j = 0; j < list.length; j++)
            for (var k = j + 1; k < list.length; k++) {
                var fData, sData;
                if (list[j] instanceof ClusterLeaf)
                    fData = [data[list[j].index]];
                else {
                    fData = new Array(list[j].index.length);
                    for (var e = 0; e < fData.length; e++)
                        fData[e] = data[list[j].index[e].index];
                }
                if (list[k] instanceof ClusterLeaf)
                    sData = [data[list[k].index]];
                else {
                    sData = new Array(list[k].index.length);
                    for (var f = 0; f < sData.length; f++)
                        sData[f] = data[list[k].index[f].index];
                }
                dis = options.kind(fData, sData, options.disFunc).toFixed(4);
                if (dis in d) {
                    d[dis].push([list[j], list[k]]);
                }
                else {
                    d[dis] = [[list[j], list[k]]];
                }
                min = Math.min(dis, min);
            }

        // cluster dots
        var dmin = d[min.toFixed(4)];
        var clustered = new Array(dmin.length);
        var aux,
            count = 0;
        while (dmin.length > 0) {
            aux = dmin.shift();
            for (var q = 0; q < dmin.length; q++) {
                var int = dmin[q].filter(function(n) {
                    //noinspection JSReferencingMutableVariableFromClosure
                    return aux.indexOf(n) !== -1
                });
                if (int.length > 0) {
                    var diff = dmin[q].filter(function(n) {
                        //noinspection JSReferencingMutableVariableFromClosure
                        return aux.indexOf(n) === -1
                    });
                    aux = aux.concat(diff);
                    dmin.splice(q-- ,1);
                }
            }
            clustered[count++] = aux;
        }
        clustered.length = count;

        for (var ii = 0; ii < clustered.length; ii++) {
            var obj = new Cluster();
            obj.children = clustered[ii].concat();
            obj.distance = min;
            obj.index = new Array(len);
            var indCount = 0;
            for (var jj = 0; jj < clustered[ii].length; jj++) {
                if (clustered[ii][jj] instanceof ClusterLeaf)
                    obj.index[indCount++] = clustered[ii][jj];
                else {
                    indCount += clustered[ii][jj].index.length;
                    obj.index = clustered[ii][jj].index.concat(obj.index);
                }
                list.splice((list.indexOf(clustered[ii][jj])), 1);
            }
            obj.index.length = indCount;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImpzL2hjbHVzdC5qcyIsImpzL2hjbHVzdC9zcmMvQ2x1c3Rlci5qcyIsImpzL2hjbHVzdC9zcmMvQ2x1c3RlckxlYWYuanMiLCJqcy9oY2x1c3Qvc3JjL2FnbmVzLmpzIiwianMvaGNsdXN0L3NyYy9kaWFuYS5qcyIsImpzL2hjbHVzdC9zcmMvaW5kZXguanMiLCJqcy9oY2x1c3Qvc3JjL21sLWV1Y2xpZGVhbi1kaXN0YW5jZS5qcyIsIi4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luaGVyaXRzL2luaGVyaXRzX2Jyb3dzZXIuanMiLCIuLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIuLi8uLi8uLi8uLi91c3IvbG9jYWwvbGliL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3N1cHBvcnQvaXNCdWZmZXJCcm93c2VyLmpzIiwiLi4vLi4vLi4vLi4vdXNyL2xvY2FsL2xpYi9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC91dGlsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBOzs7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDek9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIod2luZG93IHx8IGdsb2JhbCkuSENsdXN0ID0gcmVxdWlyZSgnLi9oY2x1c3Qvc3JjJyk7IiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBDbHVzdGVyICgpIHtcbiAgICB0aGlzLmNoaWxkcmVuID0gW107XG4gICAgdGhpcy5kaXN0YW5jZSA9IC0xO1xuICAgIHRoaXMuaW5kZXggPSBbXTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGFuIGFycmF5IG9mIHZhbHVlcyB3aGVyZSBtYXhpbXVtIGRpc3RhbmNlIHNtYWxsZXIgdGhhbiB0aGUgdGhyZXNob2xkXG4gKiBAcGFyYW0ge251bWJlcn0gdGhyZXNob2xkXG4gKiBAcmV0dXJuIHtBcnJheSA8Q2x1c3Rlcj59XG4gKi9cbkNsdXN0ZXIucHJvdG90eXBlLmN1dCA9IGZ1bmN0aW9uICh0aHJlc2hvbGQpIHtcbiAgICBpZiAodGhyZXNob2xkIDwgMCkgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RocmVzaG9sZCB0b28gc21hbGwnKTtcbiAgICB2YXIgcm9vdCA9IG5ldyBDbHVzdGVyKCk7XG4gICAgcm9vdC5jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW47XG4gICAgcm9vdC5kaXN0YW5jZSA9IHRoaXMuZGlzdGFuY2U7XG4gICAgcm9vdC5pbmRleCA9IHRoaXMuaW5kZXg7XG4gICAgdmFyIGxpc3QgPSBbcm9vdF07XG4gICAgdmFyIGFucyA9IFtdO1xuICAgIHdoaWxlIChsaXN0Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIGF1eCA9IGxpc3Quc2hpZnQoKTtcbiAgICAgICAgaWYgKHRocmVzaG9sZCA+PSBhdXguZGlzdGFuY2UpXG4gICAgICAgICAgICBhbnMucHVzaChhdXgpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBsaXN0ID0gbGlzdC5jb25jYXQoYXV4LmNoaWxkcmVuKTtcbiAgICB9XG4gICAgcmV0dXJuIGFucztcbn07XG5cbi8qKlxuICogTWVyZ2UgdGhlIGxlYXZlcyBpbiB0aGUgbWluaW11bSB3YXkgdG8gaGF2ZSAnbWluR3JvdXBzJyBudW1iZXIgb2YgY2x1c3RlcnNcbiAqIEBwYXJhbSB7bnVtYmVyfSBtaW5Hcm91cHNcbiAqIEByZXR1cm4ge0NsdXN0ZXJ9XG4gKi9cbkNsdXN0ZXIucHJvdG90eXBlLmdyb3VwID0gZnVuY3Rpb24gKG1pbkdyb3Vwcykge1xuICAgIGlmIChtaW5Hcm91cHMgPCAxKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignTnVtYmVyIG9mIGdyb3VwcyB0b28gc21hbGwnKTtcbiAgICB2YXIgcm9vdCA9IG5ldyBDbHVzdGVyKCk7XG4gICAgcm9vdC5jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW47XG4gICAgcm9vdC5kaXN0YW5jZSA9IHRoaXMuZGlzdGFuY2U7XG4gICAgcm9vdC5pbmRleCA9IHRoaXMuaW5kZXg7XG4gICAgaWYgKG1pbkdyb3VwcyA9PT0gMSlcbiAgICAgICAgcmV0dXJuIHJvb3Q7XG4gICAgdmFyIGxpc3QgPSBbcm9vdF07XG4gICAgdmFyIGF1eDtcbiAgICB3aGlsZSAobGlzdC5sZW5ndGggPCBtaW5Hcm91cHMgJiYgbGlzdC5sZW5ndGggIT09IDApIHtcbiAgICAgICAgYXV4ID0gbGlzdC5zaGlmdCgpO1xuICAgICAgICBsaXN0ID0gbGlzdC5jb25jYXQoYXV4LmNoaWxkcmVuKTtcbiAgICB9XG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB0aHJvdyBuZXcgUmFuZ2VFcnJvcignTnVtYmVyIG9mIGdyb3VwcyB0b28gYmlnJyk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKVxuICAgICAgICBpZiAobGlzdFtpXS5kaXN0YW5jZSA9PT0gYXV4LmRpc3RhbmNlKSB7XG4gICAgICAgICAgICBsaXN0LmNvbmNhdChsaXN0W2ldLmNoaWxkcmVuLnNsaWNlKDEpKTtcbiAgICAgICAgICAgIGxpc3RbaV0gPSBsaXN0W2ldLmNoaWxkcmVuWzBdO1xuICAgICAgICB9XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBsaXN0Lmxlbmd0aDsgaisrKVxuICAgICAgICBpZiAobGlzdFtqXS5kaXN0YW5jZSAhPT0gMCkge1xuICAgICAgICAgICAgdmFyIG9iaiA9IGxpc3Rbal07XG4gICAgICAgICAgICBvYmouY2hpbGRyZW4gPSBvYmouaW5kZXg7XG4gICAgICAgIH1cbiAgICByZXR1cm4gcm9vdDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQ2x1c3RlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIENsdXN0ZXIgPSByZXF1aXJlKCcuL0NsdXN0ZXInKTtcbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG5mdW5jdGlvbiBDbHVzdGVyTGVhZiAoaW5kZXgpIHtcbiAgICBDbHVzdGVyLmNhbGwodGhpcyk7XG4gICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgIHRoaXMuZGlzdGFuY2UgPSAwO1xuICAgIHRoaXMuY2hpbGRyZW4gPSB1bmRlZmluZWQ7XG59XG5cbnV0aWwuaW5oZXJpdHMoQ2x1c3RlckxlYWYsIENsdXN0ZXIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IENsdXN0ZXJMZWFmO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZXVjbGlkZWFuID0gcmVxdWlyZSgnLi9tbC1ldWNsaWRlYW4tZGlzdGFuY2UnKTtcbnZhciBDbHVzdGVyTGVhZiA9IHJlcXVpcmUoJy4vQ2x1c3RlckxlYWYnKTtcbnZhciBDbHVzdGVyID0gcmVxdWlyZSgnLi9DbHVzdGVyJyk7XG5cbi8qKlxuICogQHBhcmFtIGNsdXN0ZXIxXG4gKiBAcGFyYW0gY2x1c3RlcjJcbiAqIEBwYXJhbSBkaXNGdW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIHNpbXBsZUxpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgbSA9IDEwZTEwMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsdXN0ZXIxLmxlbmd0aDsgaSsrKVxuICAgICAgICBmb3IgKHZhciBqID0gaTsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICB2YXIgZCA9IGRpc0Z1bihjbHVzdGVyMVtpXSwgY2x1c3RlcjJbal0pO1xuICAgICAgICAgICAgbSA9IE1hdGgubWluKGQsbSk7XG4gICAgICAgIH1cbiAgICByZXR1cm4gbTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gY2x1c3RlcjFcbiAqIEBwYXJhbSBjbHVzdGVyMlxuICogQHBhcmFtIGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gY29tcGxldGVMaW5rKGNsdXN0ZXIxLCBjbHVzdGVyMiwgZGlzRnVuKSB7XG4gICAgdmFyIG0gPSAtMTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsdXN0ZXIxLmxlbmd0aDsgaSsrKVxuICAgICAgICBmb3IgKHZhciBqID0gaTsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICB2YXIgZCA9IGRpc0Z1bihjbHVzdGVyMVtpXSwgY2x1c3RlcjJbal0pO1xuICAgICAgICAgICAgbSA9IE1hdGgubWF4KGQsbSk7XG4gICAgICAgIH1cbiAgICByZXR1cm4gbTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gY2x1c3RlcjFcbiAqIEBwYXJhbSBjbHVzdGVyMlxuICogQHBhcmFtIGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gYXZlcmFnZUxpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgbSA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKylcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjbHVzdGVyMi5sZW5ndGg7IGorKylcbiAgICAgICAgICAgIG0gKz0gZGlzRnVuKGNsdXN0ZXIxW2ldLCBjbHVzdGVyMltqXSk7XG4gICAgcmV0dXJuIG0gLyAoY2x1c3RlcjEubGVuZ3RoICogY2x1c3RlcjIubGVuZ3RoKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gY2x1c3RlcjFcbiAqIEBwYXJhbSBjbHVzdGVyMlxuICogQHBhcmFtIGRpc0Z1blxuICogQHJldHVybnMgeyp9XG4gKi9cbmZ1bmN0aW9uIGNlbnRyb2lkTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciB4MSA9IDAsXG4gICAgICAgIHkxID0gMCxcbiAgICAgICAgeDIgPSAwLFxuICAgICAgICB5MiA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKykge1xuICAgICAgICB4MSArPSBjbHVzdGVyMVtpXVswXTtcbiAgICAgICAgeTEgKz0gY2x1c3RlcjFbaV1bMV07XG4gICAgfVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgY2x1c3RlcjIubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgeDIgKz0gY2x1c3RlcjJbal1bMF07XG4gICAgICAgIHkyICs9IGNsdXN0ZXIyW2pdWzFdO1xuICAgIH1cbiAgICB4MSAvPSBjbHVzdGVyMS5sZW5ndGg7XG4gICAgeTEgLz0gY2x1c3RlcjEubGVuZ3RoO1xuICAgIHgyIC89IGNsdXN0ZXIyLmxlbmd0aDtcbiAgICB5MiAvPSBjbHVzdGVyMi5sZW5ndGg7XG4gICAgcmV0dXJuIGRpc0Z1bihbeDEseTFdLCBbeDIseTJdKTtcbn1cblxuLyoqXG4gKiBAcGFyYW0gY2x1c3RlcjFcbiAqIEBwYXJhbSBjbHVzdGVyMlxuICogQHBhcmFtIGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gd2FyZExpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgeDEgPSAwLFxuICAgICAgICB5MSA9IDAsXG4gICAgICAgIHgyID0gMCxcbiAgICAgICAgeTIgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3RlcjEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgeDEgKz0gY2x1c3RlcjFbaV1bMF07XG4gICAgICAgIHkxICs9IGNsdXN0ZXIxW2ldWzFdO1xuICAgIH1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIHgyICs9IGNsdXN0ZXIyW2pdWzBdO1xuICAgICAgICB5MiArPSBjbHVzdGVyMltqXVsxXTtcbiAgICB9XG4gICAgeDEgLz0gY2x1c3RlcjEubGVuZ3RoO1xuICAgIHkxIC89IGNsdXN0ZXIxLmxlbmd0aDtcbiAgICB4MiAvPSBjbHVzdGVyMi5sZW5ndGg7XG4gICAgeTIgLz0gY2x1c3RlcjIubGVuZ3RoO1xuICAgIHJldHVybiBkaXNGdW4oW3gxLHkxXSwgW3gyLHkyXSkqY2x1c3RlcjEubGVuZ3RoKmNsdXN0ZXIyLmxlbmd0aCAvIChjbHVzdGVyMS5sZW5ndGgrY2x1c3RlcjIubGVuZ3RoKTtcbn1cblxudmFyIGRlZmF1bHRPcHRpb25zID0ge1xuICAgIGRpc0Z1bmM6IGV1Y2xpZGVhbixcbiAgICBraW5kOiAnc2luZ2xlJ1xufTtcblxuLyoqXG4gKiBDb250aW51b3VzbHkgbWVyZ2Ugbm9kZXMgdGhhdCBoYXZlIHRoZSBsZWFzdCBkaXNzaW1pbGFyaXR5XG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGRhdGEgLSBBcnJheSBvZiBwb2ludHMgdG8gYmUgY2x1c3RlcmVkXG4gKiBAcGFyYW0ge2pzb259IG9wdGlvbnNcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBhZ25lcyhkYXRhLCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgZm9yICh2YXIgbyBpbiBkZWZhdWx0T3B0aW9ucylcbiAgICAgICAgaWYgKCEob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShvKSkpXG4gICAgICAgICAgICBvcHRpb25zW29dID0gZGVmYXVsdE9wdGlvbnNbb107XG4gICAgdmFyIGxlbiA9IGRhdGEubGVuZ3RoO1xuXG4gICAgLy8gYWxsb3dzIHRvIHVzZSBhIHN0cmluZyBvciBhIGdpdmVuIGZ1bmN0aW9uXG4gICAgaWYgKHR5cGVvZiBvcHRpb25zLmtpbmQgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgc3dpdGNoIChvcHRpb25zLmtpbmQpIHtcbiAgICAgICAgICAgIGNhc2UgJ3NpbmdsZSc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gc2ltcGxlTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2NvbXBsZXRlJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSBjb21wbGV0ZUxpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdhdmVyYWdlJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSBhdmVyYWdlTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ2NlbnRyb2lkJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSBjZW50cm9pZExpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd3YXJkJzpcbiAgICAgICAgICAgICAgICBvcHRpb25zLmtpbmQgPSB3YXJkTGluaztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1Vua25vd24ga2luZCBvZiBzaW1pbGFyaXR5Jyk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMua2luZCAhPT0gXCJmdW5jdGlvblwiKVxuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmRlZmluZWQga2luZCBvZiBzaW1pbGFyaXR5Jyk7XG5cbiAgICB2YXIgbGlzdCA9IG5ldyBBcnJheShsZW4pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKylcbiAgICAgICAgbGlzdFtpXSA9IG5ldyBDbHVzdGVyTGVhZihpKTtcbiAgICB2YXIgbWluICA9IDEwZTUsXG4gICAgICAgIGQgPSB7fSxcbiAgICAgICAgZGlzID0gMDtcblxuICAgIHdoaWxlIChsaXN0Lmxlbmd0aCA+IDEpIHtcblxuICAgICAgICAvLyBjYWxjdWxhdGVzIHRoZSBtaW5pbXVtIGRpc3RhbmNlXG4gICAgICAgIGQgPSB7fTtcbiAgICAgICAgbWluID0gMTBlNTtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBsaXN0Lmxlbmd0aDsgaisrKVxuICAgICAgICAgICAgZm9yICh2YXIgayA9IGogKyAxOyBrIDwgbGlzdC5sZW5ndGg7IGsrKykge1xuICAgICAgICAgICAgICAgIHZhciBmRGF0YSwgc0RhdGE7XG4gICAgICAgICAgICAgICAgaWYgKGxpc3Rbal0gaW5zdGFuY2VvZiBDbHVzdGVyTGVhZilcbiAgICAgICAgICAgICAgICAgICAgZkRhdGEgPSBbZGF0YVtsaXN0W2pdLmluZGV4XV07XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGZEYXRhID0gbmV3IEFycmF5KGxpc3Rbal0uaW5kZXgubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgZSA9IDA7IGUgPCBmRGF0YS5sZW5ndGg7IGUrKylcbiAgICAgICAgICAgICAgICAgICAgICAgIGZEYXRhW2VdID0gZGF0YVtsaXN0W2pdLmluZGV4W2VdLmluZGV4XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGxpc3Rba10gaW5zdGFuY2VvZiBDbHVzdGVyTGVhZilcbiAgICAgICAgICAgICAgICAgICAgc0RhdGEgPSBbZGF0YVtsaXN0W2tdLmluZGV4XV07XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNEYXRhID0gbmV3IEFycmF5KGxpc3Rba10uaW5kZXgubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgZiA9IDA7IGYgPCBzRGF0YS5sZW5ndGg7IGYrKylcbiAgICAgICAgICAgICAgICAgICAgICAgIHNEYXRhW2ZdID0gZGF0YVtsaXN0W2tdLmluZGV4W2ZdLmluZGV4XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGlzID0gb3B0aW9ucy5raW5kKGZEYXRhLCBzRGF0YSwgb3B0aW9ucy5kaXNGdW5jKS50b0ZpeGVkKDQpO1xuICAgICAgICAgICAgICAgIGlmIChkaXMgaW4gZCkge1xuICAgICAgICAgICAgICAgICAgICBkW2Rpc10ucHVzaChbbGlzdFtqXSwgbGlzdFtrXV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZFtkaXNdID0gW1tsaXN0W2pdLCBsaXN0W2tdXV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1pbiA9IE1hdGgubWluKGRpcywgbWluKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAvLyBjbHVzdGVyIGRvdHNcbiAgICAgICAgdmFyIGRtaW4gPSBkW21pbi50b0ZpeGVkKDQpXTtcbiAgICAgICAgdmFyIGNsdXN0ZXJlZCA9IG5ldyBBcnJheShkbWluLmxlbmd0aCk7XG4gICAgICAgIHZhciBhdXgsXG4gICAgICAgICAgICBjb3VudCA9IDA7XG4gICAgICAgIHdoaWxlIChkbWluLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGF1eCA9IGRtaW4uc2hpZnQoKTtcbiAgICAgICAgICAgIGZvciAodmFyIHEgPSAwOyBxIDwgZG1pbi5sZW5ndGg7IHErKykge1xuICAgICAgICAgICAgICAgIHZhciBpbnQgPSBkbWluW3FdLmZpbHRlcihmdW5jdGlvbihuKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vbm9pbnNwZWN0aW9uIEpTUmVmZXJlbmNpbmdNdXRhYmxlVmFyaWFibGVGcm9tQ2xvc3VyZVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXV4LmluZGV4T2YobikgIT09IC0xXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaWYgKGludC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBkaWZmID0gZG1pbltxXS5maWx0ZXIoZnVuY3Rpb24obikge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy9ub2luc3BlY3Rpb24gSlNSZWZlcmVuY2luZ011dGFibGVWYXJpYWJsZUZyb21DbG9zdXJlXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gYXV4LmluZGV4T2YobikgPT09IC0xXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBhdXggPSBhdXguY29uY2F0KGRpZmYpO1xuICAgICAgICAgICAgICAgICAgICBkbWluLnNwbGljZShxLS0gLDEpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNsdXN0ZXJlZFtjb3VudCsrXSA9IGF1eDtcbiAgICAgICAgfVxuICAgICAgICBjbHVzdGVyZWQubGVuZ3RoID0gY291bnQ7XG5cbiAgICAgICAgZm9yICh2YXIgaWkgPSAwOyBpaSA8IGNsdXN0ZXJlZC5sZW5ndGg7IGlpKyspIHtcbiAgICAgICAgICAgIHZhciBvYmogPSBuZXcgQ2x1c3RlcigpO1xuICAgICAgICAgICAgb2JqLmNoaWxkcmVuID0gY2x1c3RlcmVkW2lpXS5jb25jYXQoKTtcbiAgICAgICAgICAgIG9iai5kaXN0YW5jZSA9IG1pbjtcbiAgICAgICAgICAgIG9iai5pbmRleCA9IG5ldyBBcnJheShsZW4pO1xuICAgICAgICAgICAgdmFyIGluZENvdW50ID0gMDtcbiAgICAgICAgICAgIGZvciAodmFyIGpqID0gMDsgamogPCBjbHVzdGVyZWRbaWldLmxlbmd0aDsgamorKykge1xuICAgICAgICAgICAgICAgIGlmIChjbHVzdGVyZWRbaWldW2pqXSBpbnN0YW5jZW9mIENsdXN0ZXJMZWFmKVxuICAgICAgICAgICAgICAgICAgICBvYmouaW5kZXhbaW5kQ291bnQrK10gPSBjbHVzdGVyZWRbaWldW2pqXTtcbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaW5kQ291bnQgKz0gY2x1c3RlcmVkW2lpXVtqal0uaW5kZXgubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICBvYmouaW5kZXggPSBjbHVzdGVyZWRbaWldW2pqXS5pbmRleC5jb25jYXQob2JqLmluZGV4KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGlzdC5zcGxpY2UoKGxpc3QuaW5kZXhPZihjbHVzdGVyZWRbaWldW2pqXSkpLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9iai5pbmRleC5sZW5ndGggPSBpbmRDb3VudDtcbiAgICAgICAgICAgIGxpc3QucHVzaChvYmopO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBsaXN0WzBdO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFnbmVzOyIsIid1c2Ugc3RyaWN0JztcblxudmFyIGV1Y2xpZGVhbiA9IHJlcXVpcmUoJy4vbWwtZXVjbGlkZWFuLWRpc3RhbmNlJyk7XG52YXIgQ2x1c3RlckxlYWYgPSByZXF1aXJlKCcuL0NsdXN0ZXJMZWFmJyk7XG52YXIgQ2x1c3RlciA9IHJlcXVpcmUoJy4vQ2x1c3RlcicpO1xuXG4vKipcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gY2x1c3RlcjFcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gY2x1c3RlcjJcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gc2ltcGxlTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciBtID0gMTBlMTAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3RlcjEubGVuZ3RoOyBpKyspXG4gICAgICAgIGZvciAodmFyIGogPSBpOyBqIDwgY2x1c3RlcjIubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIHZhciBkID0gZGlzRnVuKGNsdXN0ZXIxW2ldLCBjbHVzdGVyMltqXSk7XG4gICAgICAgICAgICBtID0gTWF0aC5taW4oZCxtKTtcbiAgICAgICAgfVxuICAgIHJldHVybiBtO1xufVxuXG4vKipcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gY2x1c3RlcjFcbiAqIEBwYXJhbSB7QXJyYXkgPEFycmF5IDxudW1iZXI+Pn0gY2x1c3RlcjJcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGRpc0Z1blxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuZnVuY3Rpb24gY29tcGxldGVMaW5rKGNsdXN0ZXIxLCBjbHVzdGVyMiwgZGlzRnVuKSB7XG4gICAgdmFyIG0gPSAtMTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNsdXN0ZXIxLmxlbmd0aDsgaSsrKVxuICAgICAgICBmb3IgKHZhciBqID0gaTsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICB2YXIgZCA9IGRpc0Z1bihjbHVzdGVyMVtpXSwgY2x1c3RlcjJbal0pO1xuICAgICAgICAgICAgbSA9IE1hdGgubWF4KGQsbSk7XG4gICAgICAgIH1cbiAgICByZXR1cm4gbTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGNsdXN0ZXIxXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGNsdXN0ZXIyXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkaXNGdW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIGF2ZXJhZ2VMaW5rKGNsdXN0ZXIxLCBjbHVzdGVyMiwgZGlzRnVuKSB7XG4gICAgdmFyIG0gPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3RlcjEubGVuZ3RoOyBpKyspXG4gICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgY2x1c3RlcjIubGVuZ3RoOyBqKyspXG4gICAgICAgICAgICBtICs9IGRpc0Z1bihjbHVzdGVyMVtpXSwgY2x1c3RlcjJbal0pO1xuICAgIHJldHVybiBtIC8gKGNsdXN0ZXIxLmxlbmd0aCAqIGNsdXN0ZXIyLmxlbmd0aCk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBjbHVzdGVyMVxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBjbHVzdGVyMlxuICogQHBhcmFtIHtmdW5jdGlvbn0gZGlzRnVuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiBjZW50cm9pZExpbmsoY2x1c3RlcjEsIGNsdXN0ZXIyLCBkaXNGdW4pIHtcbiAgICB2YXIgeDEgPSAwLFxuICAgICAgICB5MSA9IDAsXG4gICAgICAgIHgyID0gMCxcbiAgICAgICAgeTIgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2x1c3RlcjEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgeDEgKz0gY2x1c3RlcjFbaV1bMF07XG4gICAgICAgIHkxICs9IGNsdXN0ZXIxW2ldWzFdO1xuICAgIH1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNsdXN0ZXIyLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIHgyICs9IGNsdXN0ZXIyW2pdWzBdO1xuICAgICAgICB5MiArPSBjbHVzdGVyMltqXVsxXTtcbiAgICB9XG4gICAgeDEgLz0gY2x1c3RlcjEubGVuZ3RoO1xuICAgIHkxIC89IGNsdXN0ZXIxLmxlbmd0aDtcbiAgICB4MiAvPSBjbHVzdGVyMi5sZW5ndGg7XG4gICAgeTIgLz0gY2x1c3RlcjIubGVuZ3RoO1xuICAgIHJldHVybiBkaXNGdW4oW3gxLHkxXSwgW3gyLHkyXSk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBjbHVzdGVyMVxuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBjbHVzdGVyMlxuICogQHBhcmFtIHtmdW5jdGlvbn0gZGlzRnVuXG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5mdW5jdGlvbiB3YXJkTGluayhjbHVzdGVyMSwgY2x1c3RlcjIsIGRpc0Z1bikge1xuICAgIHZhciB4MSA9IDAsXG4gICAgICAgIHkxID0gMCxcbiAgICAgICAgeDIgPSAwLFxuICAgICAgICB5MiA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbHVzdGVyMS5sZW5ndGg7IGkrKykge1xuICAgICAgICB4MSArPSBjbHVzdGVyMVtpXVswXTtcbiAgICAgICAgeTEgKz0gY2x1c3RlcjFbaV1bMV07XG4gICAgfVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgY2x1c3RlcjIubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgeDIgKz0gY2x1c3RlcjJbal1bMF07XG4gICAgICAgIHkyICs9IGNsdXN0ZXIyW2pdWzFdO1xuICAgIH1cbiAgICB4MSAvPSBjbHVzdGVyMS5sZW5ndGg7XG4gICAgeTEgLz0gY2x1c3RlcjEubGVuZ3RoO1xuICAgIHgyIC89IGNsdXN0ZXIyLmxlbmd0aDtcbiAgICB5MiAvPSBjbHVzdGVyMi5sZW5ndGg7XG4gICAgcmV0dXJuIGRpc0Z1bihbeDEseTFdLCBbeDIseTJdKSpjbHVzdGVyMS5sZW5ndGgqY2x1c3RlcjIubGVuZ3RoIC8gKGNsdXN0ZXIxLmxlbmd0aCtjbHVzdGVyMi5sZW5ndGgpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIG1vc3QgZGlzdGFudCBwb2ludCBhbmQgaGlzIGRpc3RhbmNlXG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IHNwbGl0dGluZyAtIENsdXN0ZXJzIHRvIHNwbGl0XG4gKiBAcGFyYW0ge0FycmF5IDxBcnJheSA8bnVtYmVyPj59IGRhdGEgLSBPcmlnaW5hbCBkYXRhXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkaXNGdW4gLSBEaXN0YW5jZSBmdW5jdGlvblxuICogQHJldHVybnMge3tkOiBudW1iZXIsIHA6IG51bWJlcn19IC0gZDogbWF4aW11bSBkaWZmZXJlbmNlIGJldHdlZW4gcG9pbnRzLCBwOiB0aGUgcG9pbnQgbW9yZSBkaXN0YW50XG4gKi9cbmZ1bmN0aW9uIGRpZmYoc3BsaXR0aW5nLCBkYXRhLCBkaXNGdW4pIHtcbiAgICB2YXIgYW5zID0ge1xuICAgICAgICBkOjAsXG4gICAgICAgIHA6MFxuICAgIH07XG5cbiAgICB2YXIgQ2kgPSBuZXcgQXJyYXkoc3BsaXR0aW5nWzBdLmxlbmd0aCk7XG4gICAgZm9yICh2YXIgZSA9IDA7IGUgPCBzcGxpdHRpbmdbMF0ubGVuZ3RoOyBlKyspXG4gICAgICAgIENpW2VdID0gZGF0YVtzcGxpdHRpbmdbMF1bZV1dO1xuICAgIHZhciBDaiA9IG5ldyBBcnJheShzcGxpdHRpbmdbMV0ubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBmID0gMDsgZiA8IHNwbGl0dGluZ1sxXS5sZW5ndGg7IGYrKylcbiAgICAgICAgQ2pbZl0gPSBkYXRhW3NwbGl0dGluZ1sxXVtmXV07XG5cbiAgICB2YXIgZGlzdCwgbmRpc3Q7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBDaS5sZW5ndGg7IGkrKykge1xuICAgICAgICBkaXN0ID0gMDtcbiAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBDaS5sZW5ndGg7IGorKylcbiAgICAgICAgICAgIGlmIChpICE9PSBqKVxuICAgICAgICAgICAgICAgIGRpc3QgKz0gZGlzRnVuKENpW2ldLCBDaVtqXSk7XG4gICAgICAgIGRpc3QgLz0gKENpLmxlbmd0aCAtIDEpO1xuICAgICAgICBuZGlzdCA9IDA7XG4gICAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgQ2oubGVuZ3RoOyBrKyspXG4gICAgICAgICAgICBuZGlzdCArPSBkaXNGdW4oQ2lbaV0sIENqW2tdKTtcbiAgICAgICAgbmRpc3QgLz0gQ2oubGVuZ3RoO1xuICAgICAgICBpZiAoKGRpc3QgLSBuZGlzdCkgPiBhbnMuZCkge1xuICAgICAgICAgICAgYW5zLmQgPSAoZGlzdCAtIG5kaXN0KTtcbiAgICAgICAgICAgIGFucy5wID0gaTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYW5zO1xufVxuXG52YXIgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgZGlzdDogZXVjbGlkZWFuLFxuICAgIGtpbmQ6ICdzaW5nbGUnXG59O1xuXG4vKipcbiAqIEludHJhLWNsdXN0ZXIgZGlzdGFuY2VcbiAqIEBwYXJhbSB7QXJyYXl9IGluZGV4XG4gKiBAcGFyYW0ge0FycmF5fSBkYXRhXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBkaXNGdW5cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cbmZ1bmN0aW9uIGludHJEaXN0KGluZGV4LCBkYXRhLCBkaXNGdW4pIHtcbiAgICB2YXIgZGlzdCA9IDAsXG4gICAgICAgIGNvdW50ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGluZGV4Lmxlbmd0aDsgaSsrKVxuICAgICAgICBmb3IgKHZhciBqID0gaTsgaiA8IGluZGV4Lmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICBkaXN0ICs9IGRpc0Z1bihkYXRhW2luZGV4W2ldLmluZGV4XSwgZGF0YVtpbmRleFtqXS5pbmRleF0pO1xuICAgICAgICAgICAgY291bnQrK1xuICAgICAgICB9XG4gICAgcmV0dXJuIGRpc3QgLyBjb3VudDtcbn1cblxuLyoqXG4gKiBTcGxpdHMgdGhlIGhpZ2hlciBsZXZlbCBjbHVzdGVyc1xuICogQHBhcmFtIHtBcnJheSA8QXJyYXkgPG51bWJlcj4+fSBkYXRhIC0gQXJyYXkgb2YgcG9pbnRzIHRvIGJlIGNsdXN0ZXJlZFxuICogQHBhcmFtIHtqc29ufSBvcHRpb25zXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gZGlhbmEoZGF0YSwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIGZvciAodmFyIG8gaW4gZGVmYXVsdE9wdGlvbnMpXG4gICAgICAgIGlmICghKG9wdGlvbnMuaGFzT3duUHJvcGVydHkobykpKVxuICAgICAgICAgICAgb3B0aW9uc1tvXSA9IGRlZmF1bHRPcHRpb25zW29dO1xuICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5raW5kID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHN3aXRjaCAob3B0aW9ucy5raW5kKSB7XG4gICAgICAgICAgICBjYXNlICdzaW5nbGUnOlxuICAgICAgICAgICAgICAgIG9wdGlvbnMua2luZCA9IHNpbXBsZUxpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdjb21wbGV0ZSc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gY29tcGxldGVMaW5rO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnYXZlcmFnZSc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gYXZlcmFnZUxpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdjZW50cm9pZCc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gY2VudHJvaWRMaW5rO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnd2FyZCc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5raW5kID0gd2FyZExpbms7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdVbmtub3duIGtpbmQgb2Ygc2ltaWxhcml0eScpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiBvcHRpb25zLmtpbmQgIT09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5kZWZpbmVkIGtpbmQgb2Ygc2ltaWxhcml0eScpO1xuICAgIHZhciB0cmVlID0gbmV3IENsdXN0ZXIoKTtcbiAgICB0cmVlLmNoaWxkcmVuID0gbmV3IEFycmF5KGRhdGEubGVuZ3RoKTtcbiAgICB0cmVlLmluZGV4ID0gbmV3IEFycmF5KGRhdGEubGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpbmQgPSAwOyBpbmQgPCBkYXRhLmxlbmd0aDsgaW5kKyspIHtcbiAgICAgICAgdHJlZS5jaGlsZHJlbltpbmRdID0gbmV3IENsdXN0ZXJMZWFmKGluZCk7XG4gICAgICAgIHRyZWUuaW5kZXhbaW5kXSA9IG5ldyBDbHVzdGVyTGVhZihpbmQpO1xuICAgIH1cblxuICAgIHRyZWUuZGlzdGFuY2UgPSBpbnRyRGlzdCh0cmVlLmluZGV4LCBkYXRhLCBvcHRpb25zLmRpc3QpO1xuICAgIHZhciBtLCBNLCBjbElkLFxuICAgICAgICBkaXN0LCByZWJlbDtcbiAgICB2YXIgbGlzdCA9IFt0cmVlXTtcbiAgICB3aGlsZSAobGlzdC5sZW5ndGggPiAwKSB7XG4gICAgICAgIE0gPSAwO1xuICAgICAgICBjbElkID0gMDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBtID0gMDtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbGlzdFtpXS5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGwgPSAoaiArIDEpOyBsIDwgbGlzdFtpXS5sZW5ndGg7IGwrKykge1xuICAgICAgICAgICAgICAgICAgICBtID0gTWF0aC5tYXgob3B0aW9ucy5kaXN0KGRhdGFbbGlzdFtpXS5pbmRleFtqXS5pbmRleF0sIGRhdGFbbGlzdFtpXS5pbmRleFtsXS5pbmRleF0pLCBtKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobSA+IE0pIHtcbiAgICAgICAgICAgICAgICBNID0gbTtcbiAgICAgICAgICAgICAgICBjbElkID0gaTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBNID0gMDtcbiAgICAgICAgaWYgKGxpc3RbY2xJZF0uaW5kZXgubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBsaXN0W2NsSWRdLmNoaWxkcmVuID0gW2xpc3RbY2xJZF0uaW5kZXhbMF0sIGxpc3RbY2xJZF0uaW5kZXhbMV1dO1xuICAgICAgICAgICAgbGlzdFtjbElkXS5kaXN0YW5jZSA9IG9wdGlvbnMuZGlzdChkYXRhW2xpc3RbY2xJZF0uaW5kZXhbMF0uaW5kZXhdLCBkYXRhW2xpc3RbY2xJZF0uaW5kZXhbMV0uaW5kZXhdKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChsaXN0W2NsSWRdLmluZGV4Lmxlbmd0aCA9PT0gMykge1xuICAgICAgICAgICAgbGlzdFtjbElkXS5jaGlsZHJlbiA9IFtsaXN0W2NsSWRdLmluZGV4WzBdLCBsaXN0W2NsSWRdLmluZGV4WzFdLCBsaXN0W2NsSWRdLmluZGV4WzJdXTtcbiAgICAgICAgICAgIHZhciBkID0gW1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuZGlzdChkYXRhW2xpc3RbY2xJZF0uaW5kZXhbMF0uaW5kZXhdLCBkYXRhW2xpc3RbY2xJZF0uaW5kZXhbMV0uaW5kZXhdKSxcbiAgICAgICAgICAgICAgICBvcHRpb25zLmRpc3QoZGF0YVtsaXN0W2NsSWRdLmluZGV4WzFdLmluZGV4XSwgZGF0YVtsaXN0W2NsSWRdLmluZGV4WzJdLmluZGV4XSlcbiAgICAgICAgICAgIF07XG4gICAgICAgICAgICBsaXN0W2NsSWRdLmRpc3RhbmNlID0gKGRbMF0gKyBkWzFdKSAvIDI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgQyA9IG5ldyBDbHVzdGVyKCk7XG4gICAgICAgICAgICB2YXIgc0cgPSBuZXcgQ2x1c3RlcigpO1xuICAgICAgICAgICAgdmFyIHNwbGl0dGluZyA9IFtuZXcgQXJyYXkobGlzdFtjbElkXS5pbmRleC5sZW5ndGgpLCBbXV07XG4gICAgICAgICAgICBmb3IgKHZhciBzcGwgPSAwOyBzcGwgPCBzcGxpdHRpbmdbMF0ubGVuZ3RoOyBzcGwrKylcbiAgICAgICAgICAgICAgICBzcGxpdHRpbmdbMF1bc3BsXSA9IHNwbDtcbiAgICAgICAgICAgIGZvciAodmFyIGlpID0gMDsgaWkgPCBzcGxpdHRpbmdbMF0ubGVuZ3RoOyBpaSsrKSB7XG4gICAgICAgICAgICAgICAgZGlzdCA9IDA7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgamogPSAwOyBqaiA8IHNwbGl0dGluZ1swXS5sZW5ndGg7IGpqKyspXG4gICAgICAgICAgICAgICAgICAgIGlmIChpaSAhPT0gamopXG4gICAgICAgICAgICAgICAgICAgICAgICBkaXN0ICs9IG9wdGlvbnMuZGlzdChkYXRhW2xpc3RbY2xJZF0uaW5kZXhbc3BsaXR0aW5nWzBdW2pqXV0uaW5kZXhdLCBkYXRhW2xpc3RbY2xJZF0uaW5kZXhbc3BsaXR0aW5nWzBdW2lpXV0uaW5kZXhdKTtcbiAgICAgICAgICAgICAgICBkaXN0IC89IChzcGxpdHRpbmdbMF0ubGVuZ3RoIC0gMSk7XG4gICAgICAgICAgICAgICAgaWYgKGRpc3QgPiBNKSB7XG4gICAgICAgICAgICAgICAgICAgIE0gPSBkaXN0O1xuICAgICAgICAgICAgICAgICAgICByZWJlbCA9IGlpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNwbGl0dGluZ1sxXSA9IFtyZWJlbF07XG4gICAgICAgICAgICBzcGxpdHRpbmdbMF0uc3BsaWNlKHJlYmVsLCAxKTtcbiAgICAgICAgICAgIGRpc3QgPSBkaWZmKHNwbGl0dGluZywgZGF0YSwgb3B0aW9ucy5kaXN0KTtcbiAgICAgICAgICAgIHdoaWxlIChkaXN0LmQgPiAwKSB7XG4gICAgICAgICAgICAgICAgc3BsaXR0aW5nWzFdLnB1c2goc3BsaXR0aW5nWzBdW2Rpc3QucF0pO1xuICAgICAgICAgICAgICAgIHNwbGl0dGluZ1swXS5zcGxpY2UoZGlzdC5wLCAxKTtcbiAgICAgICAgICAgICAgICBkaXN0ID0gZGlmZihzcGxpdHRpbmcsIGRhdGEsIG9wdGlvbnMuZGlzdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgZkRhdGEgPSBuZXcgQXJyYXkoc3BsaXR0aW5nWzBdLmxlbmd0aCk7XG4gICAgICAgICAgICBDLmluZGV4ID0gbmV3IEFycmF5KHNwbGl0dGluZ1swXS5sZW5ndGgpO1xuICAgICAgICAgICAgZm9yICh2YXIgZSA9IDA7IGUgPCBmRGF0YS5sZW5ndGg7IGUrKykge1xuICAgICAgICAgICAgICAgIGZEYXRhW2VdID0gZGF0YVtsaXN0W2NsSWRdLmluZGV4W3NwbGl0dGluZ1swXVtlXV0uaW5kZXhdO1xuICAgICAgICAgICAgICAgIEMuaW5kZXhbZV0gPSBsaXN0W2NsSWRdLmluZGV4W3NwbGl0dGluZ1swXVtlXV07XG4gICAgICAgICAgICAgICAgQy5jaGlsZHJlbltlXSA9IGxpc3RbY2xJZF0uaW5kZXhbc3BsaXR0aW5nWzBdW2VdXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBzRGF0YSA9IG5ldyBBcnJheShzcGxpdHRpbmdbMV0ubGVuZ3RoKTtcbiAgICAgICAgICAgIHNHLmluZGV4ID0gbmV3IEFycmF5KHNwbGl0dGluZ1sxXS5sZW5ndGgpO1xuICAgICAgICAgICAgZm9yICh2YXIgZiA9IDA7IGYgPCBzRGF0YS5sZW5ndGg7IGYrKykge1xuICAgICAgICAgICAgICAgIHNEYXRhW2ZdID0gZGF0YVtsaXN0W2NsSWRdLmluZGV4W3NwbGl0dGluZ1sxXVtmXV0uaW5kZXhdO1xuICAgICAgICAgICAgICAgIHNHLmluZGV4W2ZdID0gbGlzdFtjbElkXS5pbmRleFtzcGxpdHRpbmdbMV1bZl1dO1xuICAgICAgICAgICAgICAgIHNHLmNoaWxkcmVuW2ZdID0gbGlzdFtjbElkXS5pbmRleFtzcGxpdHRpbmdbMV1bZl1dO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgQy5kaXN0YW5jZSA9IGludHJEaXN0KEMuaW5kZXgsIGRhdGEsIG9wdGlvbnMuZGlzdCk7XG4gICAgICAgICAgICBzRy5kaXN0YW5jZSA9IGludHJEaXN0KHNHLmluZGV4LCBkYXRhLCBvcHRpb25zLmRpc3QpO1xuICAgICAgICAgICAgbGlzdC5wdXNoKEMpO1xuICAgICAgICAgICAgbGlzdC5wdXNoKHNHKTtcbiAgICAgICAgICAgIGxpc3RbY2xJZF0uY2hpbGRyZW4gPSBbQywgc0ddO1xuICAgICAgICB9XG4gICAgICAgIGxpc3Quc3BsaWNlKGNsSWQsIDEpO1xuICAgIH1cbiAgICByZXR1cm4gdHJlZTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkaWFuYTsiLCJleHBvcnRzLmFnbmVzID0gcmVxdWlyZSgnLi9hZ25lcycpO1xuZXhwb3J0cy5kaWFuYSA9IHJlcXVpcmUoJy4vZGlhbmEnKTtcbi8vZXhwb3J0cy5iaXJjaCA9IHJlcXVpcmUoJy4vYmlyY2gnKTtcbi8vZXhwb3J0cy5jdXJlID0gcmVxdWlyZSgnLi9jdXJlJyk7XG4vL2V4cG9ydHMuY2hhbWVsZW9uID0gcmVxdWlyZSgnLi9jaGFtZWxlb24nKTsiLCIndXNlIHN0cmljdCc7XG5cbi8vIG1sLWV1Y2xpZGVhbi1kaXN0YW5jZVxuLy8gRnJvbTogaHR0cHM6Ly9naXRodWIuY29tL21sanMvZXVjbGlkZWFuLWRpc3RhbmNlXG4vLyBMaWNlbnNlOiBNSVRcblxuZnVuY3Rpb24gc3F1YXJlZEV1Y2xpZGVhbihwLCBxKSB7XG4gICAgdmFyIGQgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcC5sZW5ndGg7IGkrKykge1xuICAgICAgICBkICs9IChwW2ldIC0gcVtpXSkgKiAocFtpXSAtIHFbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gZDtcbn1cblxuZnVuY3Rpb24gZXVjbGlkZWFuKHAsIHEpIHtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KHNxdWFyZWRFdWNsaWRlYW4ocCwgcSkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGV1Y2xpZGVhbjtcbmV1Y2xpZGVhbi5zcXVhcmVkID0gc3F1YXJlZEV1Y2xpZGVhbjsiLCJpZiAodHlwZW9mIE9iamVjdC5jcmVhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgLy8gaW1wbGVtZW50YXRpb24gZnJvbSBzdGFuZGFyZCBub2RlLmpzICd1dGlsJyBtb2R1bGVcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIGN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckN0b3IucHJvdG90eXBlLCB7XG4gICAgICBjb25zdHJ1Y3Rvcjoge1xuICAgICAgICB2YWx1ZTogY3RvcixcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn0gZWxzZSB7XG4gIC8vIG9sZCBzY2hvb2wgc2hpbSBmb3Igb2xkIGJyb3dzZXJzXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fVxuICAgIFRlbXBDdG9yLnByb3RvdHlwZSA9IHN1cGVyQ3Rvci5wcm90b3R5cGVcbiAgICBjdG9yLnByb3RvdHlwZSA9IG5ldyBUZW1wQ3RvcigpXG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yXG4gIH1cbn1cbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc0J1ZmZlcihhcmcpIHtcbiAgcmV0dXJuIGFyZyAmJiB0eXBlb2YgYXJnID09PSAnb2JqZWN0J1xuICAgICYmIHR5cGVvZiBhcmcuY29weSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICYmIHR5cGVvZiBhcmcuZmlsbCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICYmIHR5cGVvZiBhcmcucmVhZFVJbnQ4ID09PSAnZnVuY3Rpb24nO1xufSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG52YXIgZm9ybWF0UmVnRXhwID0gLyVbc2RqJV0vZztcbmV4cG9ydHMuZm9ybWF0ID0gZnVuY3Rpb24oZikge1xuICBpZiAoIWlzU3RyaW5nKGYpKSB7XG4gICAgdmFyIG9iamVjdHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgb2JqZWN0cy5wdXNoKGluc3BlY3QoYXJndW1lbnRzW2ldKSk7XG4gICAgfVxuICAgIHJldHVybiBvYmplY3RzLmpvaW4oJyAnKTtcbiAgfVxuXG4gIHZhciBpID0gMTtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gIHZhciBsZW4gPSBhcmdzLmxlbmd0aDtcbiAgdmFyIHN0ciA9IFN0cmluZyhmKS5yZXBsYWNlKGZvcm1hdFJlZ0V4cCwgZnVuY3Rpb24oeCkge1xuICAgIGlmICh4ID09PSAnJSUnKSByZXR1cm4gJyUnO1xuICAgIGlmIChpID49IGxlbikgcmV0dXJuIHg7XG4gICAgc3dpdGNoICh4KSB7XG4gICAgICBjYXNlICclcyc6IHJldHVybiBTdHJpbmcoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVkJzogcmV0dXJuIE51bWJlcihhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWonOlxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShhcmdzW2krK10pO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgcmV0dXJuICdbQ2lyY3VsYXJdJztcbiAgICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuICB9KTtcbiAgZm9yICh2YXIgeCA9IGFyZ3NbaV07IGkgPCBsZW47IHggPSBhcmdzWysraV0pIHtcbiAgICBpZiAoaXNOdWxsKHgpIHx8ICFpc09iamVjdCh4KSkge1xuICAgICAgc3RyICs9ICcgJyArIHg7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciArPSAnICcgKyBpbnNwZWN0KHgpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RyO1xufTtcblxuXG4vLyBNYXJrIHRoYXQgYSBtZXRob2Qgc2hvdWxkIG5vdCBiZSB1c2VkLlxuLy8gUmV0dXJucyBhIG1vZGlmaWVkIGZ1bmN0aW9uIHdoaWNoIHdhcm5zIG9uY2UgYnkgZGVmYXVsdC5cbi8vIElmIC0tbm8tZGVwcmVjYXRpb24gaXMgc2V0LCB0aGVuIGl0IGlzIGEgbm8tb3AuXG5leHBvcnRzLmRlcHJlY2F0ZSA9IGZ1bmN0aW9uKGZuLCBtc2cpIHtcbiAgLy8gQWxsb3cgZm9yIGRlcHJlY2F0aW5nIHRoaW5ncyBpbiB0aGUgcHJvY2VzcyBvZiBzdGFydGluZyB1cC5cbiAgaWYgKGlzVW5kZWZpbmVkKGdsb2JhbC5wcm9jZXNzKSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBleHBvcnRzLmRlcHJlY2F0ZShmbiwgbXNnKS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuICBpZiAocHJvY2Vzcy5ub0RlcHJlY2F0aW9uID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGZuO1xuICB9XG5cbiAgdmFyIHdhcm5lZCA9IGZhbHNlO1xuICBmdW5jdGlvbiBkZXByZWNhdGVkKCkge1xuICAgIGlmICghd2FybmVkKSB7XG4gICAgICBpZiAocHJvY2Vzcy50aHJvd0RlcHJlY2F0aW9uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtc2cpO1xuICAgICAgfSBlbHNlIGlmIChwcm9jZXNzLnRyYWNlRGVwcmVjYXRpb24pIHtcbiAgICAgICAgY29uc29sZS50cmFjZShtc2cpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihtc2cpO1xuICAgICAgfVxuICAgICAgd2FybmVkID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH1cblxuICByZXR1cm4gZGVwcmVjYXRlZDtcbn07XG5cblxudmFyIGRlYnVncyA9IHt9O1xudmFyIGRlYnVnRW52aXJvbjtcbmV4cG9ydHMuZGVidWdsb2cgPSBmdW5jdGlvbihzZXQpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKGRlYnVnRW52aXJvbikpXG4gICAgZGVidWdFbnZpcm9uID0gcHJvY2Vzcy5lbnYuTk9ERV9ERUJVRyB8fCAnJztcbiAgc2V0ID0gc2V0LnRvVXBwZXJDYXNlKCk7XG4gIGlmICghZGVidWdzW3NldF0pIHtcbiAgICBpZiAobmV3IFJlZ0V4cCgnXFxcXGInICsgc2V0ICsgJ1xcXFxiJywgJ2knKS50ZXN0KGRlYnVnRW52aXJvbikpIHtcbiAgICAgIHZhciBwaWQgPSBwcm9jZXNzLnBpZDtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBtc2cgPSBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCclcyAlZDogJXMnLCBzZXQsIHBpZCwgbXNnKTtcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7fTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGRlYnVnc1tzZXRdO1xufTtcblxuXG4vKipcbiAqIEVjaG9zIHRoZSB2YWx1ZSBvZiBhIHZhbHVlLiBUcnlzIHRvIHByaW50IHRoZSB2YWx1ZSBvdXRcbiAqIGluIHRoZSBiZXN0IHdheSBwb3NzaWJsZSBnaXZlbiB0aGUgZGlmZmVyZW50IHR5cGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBwcmludCBvdXQuXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0cyBPcHRpb25hbCBvcHRpb25zIG9iamVjdCB0aGF0IGFsdGVycyB0aGUgb3V0cHV0LlxuICovXG4vKiBsZWdhY3k6IG9iaiwgc2hvd0hpZGRlbiwgZGVwdGgsIGNvbG9ycyovXG5mdW5jdGlvbiBpbnNwZWN0KG9iaiwgb3B0cykge1xuICAvLyBkZWZhdWx0IG9wdGlvbnNcbiAgdmFyIGN0eCA9IHtcbiAgICBzZWVuOiBbXSxcbiAgICBzdHlsaXplOiBzdHlsaXplTm9Db2xvclxuICB9O1xuICAvLyBsZWdhY3kuLi5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gMykgY3R4LmRlcHRoID0gYXJndW1lbnRzWzJdO1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSA0KSBjdHguY29sb3JzID0gYXJndW1lbnRzWzNdO1xuICBpZiAoaXNCb29sZWFuKG9wdHMpKSB7XG4gICAgLy8gbGVnYWN5Li4uXG4gICAgY3R4LnNob3dIaWRkZW4gPSBvcHRzO1xuICB9IGVsc2UgaWYgKG9wdHMpIHtcbiAgICAvLyBnb3QgYW4gXCJvcHRpb25zXCIgb2JqZWN0XG4gICAgZXhwb3J0cy5fZXh0ZW5kKGN0eCwgb3B0cyk7XG4gIH1cbiAgLy8gc2V0IGRlZmF1bHQgb3B0aW9uc1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LnNob3dIaWRkZW4pKSBjdHguc2hvd0hpZGRlbiA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmRlcHRoKSkgY3R4LmRlcHRoID0gMjtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jb2xvcnMpKSBjdHguY29sb3JzID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY3VzdG9tSW5zcGVjdCkpIGN0eC5jdXN0b21JbnNwZWN0ID0gdHJ1ZTtcbiAgaWYgKGN0eC5jb2xvcnMpIGN0eC5zdHlsaXplID0gc3R5bGl6ZVdpdGhDb2xvcjtcbiAgcmV0dXJuIGZvcm1hdFZhbHVlKGN0eCwgb2JqLCBjdHguZGVwdGgpO1xufVxuZXhwb3J0cy5pbnNwZWN0ID0gaW5zcGVjdDtcblxuXG4vLyBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0FOU0lfZXNjYXBlX2NvZGUjZ3JhcGhpY3Ncbmluc3BlY3QuY29sb3JzID0ge1xuICAnYm9sZCcgOiBbMSwgMjJdLFxuICAnaXRhbGljJyA6IFszLCAyM10sXG4gICd1bmRlcmxpbmUnIDogWzQsIDI0XSxcbiAgJ2ludmVyc2UnIDogWzcsIDI3XSxcbiAgJ3doaXRlJyA6IFszNywgMzldLFxuICAnZ3JleScgOiBbOTAsIDM5XSxcbiAgJ2JsYWNrJyA6IFszMCwgMzldLFxuICAnYmx1ZScgOiBbMzQsIDM5XSxcbiAgJ2N5YW4nIDogWzM2LCAzOV0sXG4gICdncmVlbicgOiBbMzIsIDM5XSxcbiAgJ21hZ2VudGEnIDogWzM1LCAzOV0sXG4gICdyZWQnIDogWzMxLCAzOV0sXG4gICd5ZWxsb3cnIDogWzMzLCAzOV1cbn07XG5cbi8vIERvbid0IHVzZSAnYmx1ZScgbm90IHZpc2libGUgb24gY21kLmV4ZVxuaW5zcGVjdC5zdHlsZXMgPSB7XG4gICdzcGVjaWFsJzogJ2N5YW4nLFxuICAnbnVtYmVyJzogJ3llbGxvdycsXG4gICdib29sZWFuJzogJ3llbGxvdycsXG4gICd1bmRlZmluZWQnOiAnZ3JleScsXG4gICdudWxsJzogJ2JvbGQnLFxuICAnc3RyaW5nJzogJ2dyZWVuJyxcbiAgJ2RhdGUnOiAnbWFnZW50YScsXG4gIC8vIFwibmFtZVwiOiBpbnRlbnRpb25hbGx5IG5vdCBzdHlsaW5nXG4gICdyZWdleHAnOiAncmVkJ1xufTtcblxuXG5mdW5jdGlvbiBzdHlsaXplV2l0aENvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHZhciBzdHlsZSA9IGluc3BlY3Quc3R5bGVzW3N0eWxlVHlwZV07XG5cbiAgaWYgKHN0eWxlKSB7XG4gICAgcmV0dXJuICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMF0gKyAnbScgKyBzdHIgK1xuICAgICAgICAgICAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzFdICsgJ20nO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBzdHlsaXplTm9Db2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICByZXR1cm4gc3RyO1xufVxuXG5cbmZ1bmN0aW9uIGFycmF5VG9IYXNoKGFycmF5KSB7XG4gIHZhciBoYXNoID0ge307XG5cbiAgYXJyYXkuZm9yRWFjaChmdW5jdGlvbih2YWwsIGlkeCkge1xuICAgIGhhc2hbdmFsXSA9IHRydWU7XG4gIH0pO1xuXG4gIHJldHVybiBoYXNoO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFZhbHVlKGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcykge1xuICAvLyBQcm92aWRlIGEgaG9vayBmb3IgdXNlci1zcGVjaWZpZWQgaW5zcGVjdCBmdW5jdGlvbnMuXG4gIC8vIENoZWNrIHRoYXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW4gaW5zcGVjdCBmdW5jdGlvbiBvbiBpdFxuICBpZiAoY3R4LmN1c3RvbUluc3BlY3QgJiZcbiAgICAgIHZhbHVlICYmXG4gICAgICBpc0Z1bmN0aW9uKHZhbHVlLmluc3BlY3QpICYmXG4gICAgICAvLyBGaWx0ZXIgb3V0IHRoZSB1dGlsIG1vZHVsZSwgaXQncyBpbnNwZWN0IGZ1bmN0aW9uIGlzIHNwZWNpYWxcbiAgICAgIHZhbHVlLmluc3BlY3QgIT09IGV4cG9ydHMuaW5zcGVjdCAmJlxuICAgICAgLy8gQWxzbyBmaWx0ZXIgb3V0IGFueSBwcm90b3R5cGUgb2JqZWN0cyB1c2luZyB0aGUgY2lyY3VsYXIgY2hlY2suXG4gICAgICAhKHZhbHVlLmNvbnN0cnVjdG9yICYmIHZhbHVlLmNvbnN0cnVjdG9yLnByb3RvdHlwZSA9PT0gdmFsdWUpKSB7XG4gICAgdmFyIHJldCA9IHZhbHVlLmluc3BlY3QocmVjdXJzZVRpbWVzLCBjdHgpO1xuICAgIGlmICghaXNTdHJpbmcocmV0KSkge1xuICAgICAgcmV0ID0gZm9ybWF0VmFsdWUoY3R4LCByZXQsIHJlY3Vyc2VUaW1lcyk7XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cblxuICAvLyBQcmltaXRpdmUgdHlwZXMgY2Fubm90IGhhdmUgcHJvcGVydGllc1xuICB2YXIgcHJpbWl0aXZlID0gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpO1xuICBpZiAocHJpbWl0aXZlKSB7XG4gICAgcmV0dXJuIHByaW1pdGl2ZTtcbiAgfVxuXG4gIC8vIExvb2sgdXAgdGhlIGtleXMgb2YgdGhlIG9iamVjdC5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSk7XG4gIHZhciB2aXNpYmxlS2V5cyA9IGFycmF5VG9IYXNoKGtleXMpO1xuXG4gIGlmIChjdHguc2hvd0hpZGRlbikge1xuICAgIGtleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh2YWx1ZSk7XG4gIH1cblxuICAvLyBJRSBkb2Vzbid0IG1ha2UgZXJyb3IgZmllbGRzIG5vbi1lbnVtZXJhYmxlXG4gIC8vIGh0dHA6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS9pZS9kd3c1MnNidCh2PXZzLjk0KS5hc3B4XG4gIGlmIChpc0Vycm9yKHZhbHVlKVxuICAgICAgJiYgKGtleXMuaW5kZXhPZignbWVzc2FnZScpID49IDAgfHwga2V5cy5pbmRleE9mKCdkZXNjcmlwdGlvbicpID49IDApKSB7XG4gICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIC8vIFNvbWUgdHlwZSBvZiBvYmplY3Qgd2l0aG91dCBwcm9wZXJ0aWVzIGNhbiBiZSBzaG9ydGN1dHRlZC5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICB2YXIgbmFtZSA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbRnVuY3Rpb24nICsgbmFtZSArICddJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9XG4gICAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShEYXRlLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ2RhdGUnKTtcbiAgICB9XG4gICAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIHZhciBiYXNlID0gJycsIGFycmF5ID0gZmFsc2UsIGJyYWNlcyA9IFsneycsICd9J107XG5cbiAgLy8gTWFrZSBBcnJheSBzYXkgdGhhdCB0aGV5IGFyZSBBcnJheVxuICBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBhcnJheSA9IHRydWU7XG4gICAgYnJhY2VzID0gWydbJywgJ10nXTtcbiAgfVxuXG4gIC8vIE1ha2UgZnVuY3Rpb25zIHNheSB0aGF0IHRoZXkgYXJlIGZ1bmN0aW9uc1xuICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICB2YXIgbiA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgIGJhc2UgPSAnIFtGdW5jdGlvbicgKyBuICsgJ10nO1xuICB9XG5cbiAgLy8gTWFrZSBSZWdFeHBzIHNheSB0aGF0IHRoZXkgYXJlIFJlZ0V4cHNcbiAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBkYXRlcyB3aXRoIHByb3BlcnRpZXMgZmlyc3Qgc2F5IHRoZSBkYXRlXG4gIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIERhdGUucHJvdG90eXBlLnRvVVRDU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBlcnJvciB3aXRoIG1lc3NhZ2UgZmlyc3Qgc2F5IHRoZSBlcnJvclxuICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwICYmICghYXJyYXkgfHwgdmFsdWUubGVuZ3RoID09IDApKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyBicmFjZXNbMV07XG4gIH1cblxuICBpZiAocmVjdXJzZVRpbWVzIDwgMCkge1xuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW09iamVjdF0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuXG4gIGN0eC5zZWVuLnB1c2godmFsdWUpO1xuXG4gIHZhciBvdXRwdXQ7XG4gIGlmIChhcnJheSkge1xuICAgIG91dHB1dCA9IGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpO1xuICB9IGVsc2Uge1xuICAgIG91dHB1dCA9IGtleXMubWFwKGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpO1xuICAgIH0pO1xuICB9XG5cbiAgY3R4LnNlZW4ucG9wKCk7XG5cbiAgcmV0dXJuIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSkge1xuICBpZiAoaXNVbmRlZmluZWQodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgndW5kZWZpbmVkJywgJ3VuZGVmaW5lZCcpO1xuICBpZiAoaXNTdHJpbmcodmFsdWUpKSB7XG4gICAgdmFyIHNpbXBsZSA9ICdcXCcnICsgSlNPTi5zdHJpbmdpZnkodmFsdWUpLnJlcGxhY2UoL15cInxcIiQvZywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpICsgJ1xcJyc7XG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKHNpbXBsZSwgJ3N0cmluZycpO1xuICB9XG4gIGlmIChpc051bWJlcih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdudW1iZXInKTtcbiAgaWYgKGlzQm9vbGVhbih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdib29sZWFuJyk7XG4gIC8vIEZvciBzb21lIHJlYXNvbiB0eXBlb2YgbnVsbCBpcyBcIm9iamVjdFwiLCBzbyBzcGVjaWFsIGNhc2UgaGVyZS5cbiAgaWYgKGlzTnVsbCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCdudWxsJywgJ251bGwnKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRFcnJvcih2YWx1ZSkge1xuICByZXR1cm4gJ1snICsgRXJyb3IucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpICsgJ10nO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpIHtcbiAgdmFyIG91dHB1dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHZhbHVlLmxlbmd0aDsgaSA8IGw7ICsraSkge1xuICAgIGlmIChoYXNPd25Qcm9wZXJ0eSh2YWx1ZSwgU3RyaW5nKGkpKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBTdHJpbmcoaSksIHRydWUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0cHV0LnB1c2goJycpO1xuICAgIH1cbiAgfVxuICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgaWYgKCFrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIGtleSwgdHJ1ZSkpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvdXRwdXQ7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSkge1xuICB2YXIgbmFtZSwgc3RyLCBkZXNjO1xuICBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih2YWx1ZSwga2V5KSB8fCB7IHZhbHVlOiB2YWx1ZVtrZXldIH07XG4gIGlmIChkZXNjLmdldCkge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXIvU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tTZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKCFoYXNPd25Qcm9wZXJ0eSh2aXNpYmxlS2V5cywga2V5KSkge1xuICAgIG5hbWUgPSAnWycgKyBrZXkgKyAnXSc7XG4gIH1cbiAgaWYgKCFzdHIpIHtcbiAgICBpZiAoY3R4LnNlZW4uaW5kZXhPZihkZXNjLnZhbHVlKSA8IDApIHtcbiAgICAgIGlmIChpc051bGwocmVjdXJzZVRpbWVzKSkge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIG51bGwpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCByZWN1cnNlVGltZXMgLSAxKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdHIuaW5kZXhPZignXFxuJykgPiAtMSkge1xuICAgICAgICBpZiAoYXJyYXkpIHtcbiAgICAgICAgICBzdHIgPSBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJykuc3Vic3RyKDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ciA9ICdcXG4nICsgc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0NpcmN1bGFyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmIChpc1VuZGVmaW5lZChuYW1lKSkge1xuICAgIGlmIChhcnJheSAmJiBrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH1cbiAgICBuYW1lID0gSlNPTi5zdHJpbmdpZnkoJycgKyBrZXkpO1xuICAgIGlmIChuYW1lLm1hdGNoKC9eXCIoW2EtekEtWl9dW2EtekEtWl8wLTldKilcIiQvKSkge1xuICAgICAgbmFtZSA9IG5hbWUuc3Vic3RyKDEsIG5hbWUubGVuZ3RoIC0gMik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ25hbWUnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJylcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLyheXCJ8XCIkKS9nLCBcIidcIik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ3N0cmluZycpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBuYW1lICsgJzogJyArIHN0cjtcbn1cblxuXG5mdW5jdGlvbiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcykge1xuICB2YXIgbnVtTGluZXNFc3QgPSAwO1xuICB2YXIgbGVuZ3RoID0gb3V0cHV0LnJlZHVjZShmdW5jdGlvbihwcmV2LCBjdXIpIHtcbiAgICBudW1MaW5lc0VzdCsrO1xuICAgIGlmIChjdXIuaW5kZXhPZignXFxuJykgPj0gMCkgbnVtTGluZXNFc3QrKztcbiAgICByZXR1cm4gcHJldiArIGN1ci5yZXBsYWNlKC9cXHUwMDFiXFxbXFxkXFxkP20vZywgJycpLmxlbmd0aCArIDE7XG4gIH0sIDApO1xuXG4gIGlmIChsZW5ndGggPiA2MCkge1xuICAgIHJldHVybiBicmFjZXNbMF0gK1xuICAgICAgICAgICAoYmFzZSA9PT0gJycgPyAnJyA6IGJhc2UgKyAnXFxuICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgb3V0cHV0LmpvaW4oJyxcXG4gICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgYnJhY2VzWzFdO1xuICB9XG5cbiAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyAnICcgKyBvdXRwdXQuam9pbignLCAnKSArICcgJyArIGJyYWNlc1sxXTtcbn1cblxuXG4vLyBOT1RFOiBUaGVzZSB0eXBlIGNoZWNraW5nIGZ1bmN0aW9ucyBpbnRlbnRpb25hbGx5IGRvbid0IHVzZSBgaW5zdGFuY2VvZmBcbi8vIGJlY2F1c2UgaXQgaXMgZnJhZ2lsZSBhbmQgY2FuIGJlIGVhc2lseSBmYWtlZCB3aXRoIGBPYmplY3QuY3JlYXRlKClgLlxuZnVuY3Rpb24gaXNBcnJheShhcikge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShhcik7XG59XG5leHBvcnRzLmlzQXJyYXkgPSBpc0FycmF5O1xuXG5mdW5jdGlvbiBpc0Jvb2xlYW4oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnYm9vbGVhbic7XG59XG5leHBvcnRzLmlzQm9vbGVhbiA9IGlzQm9vbGVhbjtcblxuZnVuY3Rpb24gaXNOdWxsKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGwgPSBpc051bGw7XG5cbmZ1bmN0aW9uIGlzTnVsbE9yVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbE9yVW5kZWZpbmVkID0gaXNOdWxsT3JVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5leHBvcnRzLmlzTnVtYmVyID0gaXNOdW1iZXI7XG5cbmZ1bmN0aW9uIGlzU3RyaW5nKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N0cmluZyc7XG59XG5leHBvcnRzLmlzU3RyaW5nID0gaXNTdHJpbmc7XG5cbmZ1bmN0aW9uIGlzU3ltYm9sKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCc7XG59XG5leHBvcnRzLmlzU3ltYm9sID0gaXNTeW1ib2w7XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG5leHBvcnRzLmlzVW5kZWZpbmVkID0gaXNVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzUmVnRXhwKHJlKSB7XG4gIHJldHVybiBpc09iamVjdChyZSkgJiYgb2JqZWN0VG9TdHJpbmcocmUpID09PSAnW29iamVjdCBSZWdFeHBdJztcbn1cbmV4cG9ydHMuaXNSZWdFeHAgPSBpc1JlZ0V4cDtcblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5leHBvcnRzLmlzT2JqZWN0ID0gaXNPYmplY3Q7XG5cbmZ1bmN0aW9uIGlzRGF0ZShkKSB7XG4gIHJldHVybiBpc09iamVjdChkKSAmJiBvYmplY3RUb1N0cmluZyhkKSA9PT0gJ1tvYmplY3QgRGF0ZV0nO1xufVxuZXhwb3J0cy5pc0RhdGUgPSBpc0RhdGU7XG5cbmZ1bmN0aW9uIGlzRXJyb3IoZSkge1xuICByZXR1cm4gaXNPYmplY3QoZSkgJiZcbiAgICAgIChvYmplY3RUb1N0cmluZyhlKSA9PT0gJ1tvYmplY3QgRXJyb3JdJyB8fCBlIGluc3RhbmNlb2YgRXJyb3IpO1xufVxuZXhwb3J0cy5pc0Vycm9yID0gaXNFcnJvcjtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5leHBvcnRzLmlzRnVuY3Rpb24gPSBpc0Z1bmN0aW9uO1xuXG5mdW5jdGlvbiBpc1ByaW1pdGl2ZShhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbCB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N0cmluZycgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnIHx8ICAvLyBFUzYgc3ltYm9sXG4gICAgICAgICB0eXBlb2YgYXJnID09PSAndW5kZWZpbmVkJztcbn1cbmV4cG9ydHMuaXNQcmltaXRpdmUgPSBpc1ByaW1pdGl2ZTtcblxuZXhwb3J0cy5pc0J1ZmZlciA9IHJlcXVpcmUoJy4vc3VwcG9ydC9pc0J1ZmZlcicpO1xuXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyhvKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobyk7XG59XG5cblxuZnVuY3Rpb24gcGFkKG4pIHtcbiAgcmV0dXJuIG4gPCAxMCA/ICcwJyArIG4udG9TdHJpbmcoMTApIDogbi50b1N0cmluZygxMCk7XG59XG5cblxudmFyIG1vbnRocyA9IFsnSmFuJywgJ0ZlYicsICdNYXInLCAnQXByJywgJ01heScsICdKdW4nLCAnSnVsJywgJ0F1ZycsICdTZXAnLFxuICAgICAgICAgICAgICAnT2N0JywgJ05vdicsICdEZWMnXTtcblxuLy8gMjYgRmViIDE2OjE5OjM0XG5mdW5jdGlvbiB0aW1lc3RhbXAoKSB7XG4gIHZhciBkID0gbmV3IERhdGUoKTtcbiAgdmFyIHRpbWUgPSBbcGFkKGQuZ2V0SG91cnMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldE1pbnV0ZXMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldFNlY29uZHMoKSldLmpvaW4oJzonKTtcbiAgcmV0dXJuIFtkLmdldERhdGUoKSwgbW9udGhzW2QuZ2V0TW9udGgoKV0sIHRpbWVdLmpvaW4oJyAnKTtcbn1cblxuXG4vLyBsb2cgaXMganVzdCBhIHRoaW4gd3JhcHBlciB0byBjb25zb2xlLmxvZyB0aGF0IHByZXBlbmRzIGEgdGltZXN0YW1wXG5leHBvcnRzLmxvZyA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLmxvZygnJXMgLSAlcycsIHRpbWVzdGFtcCgpLCBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpKTtcbn07XG5cblxuLyoqXG4gKiBJbmhlcml0IHRoZSBwcm90b3R5cGUgbWV0aG9kcyBmcm9tIG9uZSBjb25zdHJ1Y3RvciBpbnRvIGFub3RoZXIuXG4gKlxuICogVGhlIEZ1bmN0aW9uLnByb3RvdHlwZS5pbmhlcml0cyBmcm9tIGxhbmcuanMgcmV3cml0dGVuIGFzIGEgc3RhbmRhbG9uZVxuICogZnVuY3Rpb24gKG5vdCBvbiBGdW5jdGlvbi5wcm90b3R5cGUpLiBOT1RFOiBJZiB0aGlzIGZpbGUgaXMgdG8gYmUgbG9hZGVkXG4gKiBkdXJpbmcgYm9vdHN0cmFwcGluZyB0aGlzIGZ1bmN0aW9uIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB1c2luZyBzb21lIG5hdGl2ZVxuICogZnVuY3Rpb25zIGFzIHByb3RvdHlwZSBzZXR1cCB1c2luZyBub3JtYWwgSmF2YVNjcmlwdCBkb2VzIG5vdCB3b3JrIGFzXG4gKiBleHBlY3RlZCBkdXJpbmcgYm9vdHN0cmFwcGluZyAoc2VlIG1pcnJvci5qcyBpbiByMTE0OTAzKS5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHdoaWNoIG5lZWRzIHRvIGluaGVyaXQgdGhlXG4gKiAgICAgcHJvdG90eXBlLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gc3VwZXJDdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHRvIGluaGVyaXQgcHJvdG90eXBlIGZyb20uXG4gKi9cbmV4cG9ydHMuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuXG5leHBvcnRzLl9leHRlbmQgPSBmdW5jdGlvbihvcmlnaW4sIGFkZCkge1xuICAvLyBEb24ndCBkbyBhbnl0aGluZyBpZiBhZGQgaXNuJ3QgYW4gb2JqZWN0XG4gIGlmICghYWRkIHx8ICFpc09iamVjdChhZGQpKSByZXR1cm4gb3JpZ2luO1xuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoYWRkKTtcbiAgdmFyIGkgPSBrZXlzLmxlbmd0aDtcbiAgd2hpbGUgKGktLSkge1xuICAgIG9yaWdpbltrZXlzW2ldXSA9IGFkZFtrZXlzW2ldXTtcbiAgfVxuICByZXR1cm4gb3JpZ2luO1xufTtcblxuZnVuY3Rpb24gaGFzT3duUHJvcGVydHkob2JqLCBwcm9wKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cbiJdfQ==

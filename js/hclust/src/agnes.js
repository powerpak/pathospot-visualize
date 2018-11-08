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
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

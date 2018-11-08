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

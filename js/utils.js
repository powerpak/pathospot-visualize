function fixUnit(unit) {
  if (unit) {
    unit = unit.replace(/MOUNT SINAI HOSPITAL +/, 'HOSP ');
    unit = unit.replace(/EMERGENCY (DEPARTMENT|DEPT)/, 'ED');
    unit = unit.replace(/INITIAL DEPARTMENT/, '??');
    unit = unit.replace(/NS INTERNAL MEDICINE/, 'NS IM');
    unit = unit.replace(/INTERVENTIONAL RADIOLOGY/, 'IR');
    unit = unit.replace(/^FPA.*/, 'FPA');
    if (window.ANON) { unit = rot13(unit); }
  }
  return unit;
}

function fixForClass(value) {
  return value.replace(/\W/g, '-');
}

function formatDate(d) {
  if (!d) { return ''; }
  d = new Date(d);
  return d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2);
}

// one-liner from http://stackoverflow.com/questions/11582512/how-to-get-url-parameters-with-javascript/11582513
function getURLParameter(name) {
  return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)')
      .exec(location.search) || [null, ''])[1]
      .replace(/\+/g, '%20')) || null;
}

function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function rot13(s) {
  return s.replace(/[a-zA-Z]/g,function(c){return String.fromCharCode((c<="Z"?90:122)>=(c=c.charCodeAt(0)+13)?c:c-26);});
}

function parseInt10(s) { 
  return parseInt(s, 10);
}

function stringifyTuple(tuple) {
  return tuple.join("\n");
}

function getFilters() {
  var filters = $('#filter').val(),
    mlstFilters = _.filter(filters, function(v) { return (/^MLST:/).test(v); }),
    unitFilters = _.filter(filters, function(v) { return (/^Unit:/).test(v); });
  return {
    mergeSamePt: _.contains(filters, 'mergeSamePt'), 
    clustersOnly: _.contains(filters, 'clustersOnly'),
    mlsts: _.map(mlstFilters, function(v) { return v.split(':')[1]; }),
    units: _.map(unitFilters, function(v) { return v.split(':')[1]; })
  };
}

Array.prototype.swap = function (x, y) {
  var b = this[x];
  this[x] = this[y];
  this[y] = b;
  return this;
}

// Helper function for performant animations with requestAnimationFrame (instead of setInterval)
// https://hacks.mozilla.org/2011/08/animating-with-javascript-from-setinterval-to-requestanimationframe/
// @param render: function(deltaT, now) {}  -- called every frame to render changes;
//                                             should return false when the animation is over to stop looping
// @param element: DOMElement               -- optional, sets the element within which the animation runs
function animLoop(render, element) {
  var running, lastFrame = +(new Date()),
      raf = window.requestAnimationFrame       ||
            window.mozRequestAnimationFrame    ||
            window.webkitRequestAnimationFrame ||
            window.msRequestAnimationFrame     ||
            window.oRequestAnimationFrame;
          
  function loop(now) {
    if (running !== false) {
      raf ?
        raf(loop, element) :
        // fallback to setTimeout
        setTimeout(loop, 16);
      // Make sure to use a valid time, since:
      // - Chrome 10 doesn't return it at all
      // - setTimeout returns the actual timeout
      now = now && now > 1E4 ? now : +new Date;
      var deltaT = now - lastFrame;
      // do not render frame when deltaT is too high, and avoid nonsense negative deltaT's
      if (deltaT > 0 && deltaT < 160) {
        running = render(deltaT, now);
      }
      lastFrame = now;
    }
  }
  loop();
};
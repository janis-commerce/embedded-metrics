'use strict';

const generateMetric = require('./generate-metric');
const { METRIC_UNITS } = require('./metric-units');
const { METRIC_RESOLUTIONS } = require('./metric-resolution');

module.exports = {
	generateMetric,
	METRIC_UNITS,
	METRIC_RESOLUTIONS
};

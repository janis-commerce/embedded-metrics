'use strict';

const { METRIC_UNITS } = require('./metric-units');

// https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html

/**
 * @typedef {string[]} DimensionSet A list of Dimension names to segment the metrics
 */

/* eslint-disable max-len */
/**
 * @typedef {'Bits' | 'Bits/Second' | 'Bytes' | 'Bytes/Second' | 'Count' | 'Count/Second' | 'Gigabits' | 'Gigabits/Second' | 'Gigabytes' | 'Gigabytes/Second' | 'Kilobits' | 'Kilobits/Second' | 'Kilobytes' | 'Kilobytes/Second' | 'Megabits' | 'Megabits/Second' | 'Megabytes' | 'Megabytes/Second' | 'Microseconds' | 'Milliseconds' | 'None' | 'Percent' | 'Seconds' | 'Terabits' | 'Terabits/Second' | 'Terabytes' | 'Terabytes/Second'} MetricUnit The measurement unit of a metric
 */
/* eslint-enable max-len */

/**
 * @typedef {object} MetricDefinition The details of a metric
 * @property {string} Name The name of a metric
 * @property {MetricUnit} [Unit='Count'}] The measurement unit of a metric. By default is set to 'Count'
 * @property {number} [StorageResolution=60] The storage resolution of a metric. By default is 'Standard' (1 minute). Warning: High resolution metrics (<1 minute) have a higher cost.
 */

/**
 * @typedef {object} MetricDirective The detauls of a metric directive
 * @property {string} Namespace The namespace where the metrics live
 * @property {DimensionSet[]} Dimensions A list of dimension sets that segments the metrics
 * @property {MetricDefinition[]} Metrics A list of metrics to track
 */

/**
 * @typedef {object} MetricDirectiveInput A possibly simplified metric directive for ease of use
 * @property {string} Namespace The namespace where the metrics live
 * @property {DimensionSet[]} Dimensions A list of dimension sets that segments the metrics
 * @property {MetricDefinition[]|string[]} Metrics A list of metrics or metric names to track
 */

/**
 * @private
 * @param {MetricDirectiveInput|MetricDirectiveInput[]} metricOrMetricsArray
 * @returns {MetricDirective[]}
 */
const normalizeMetricDirectives = metricOrMetricsArray => {

	const metrics = Array.isArray(metricOrMetricsArray) ? metricOrMetricsArray : [metricOrMetricsArray];

	return metrics.map(({ Metrics, ...rest }) => ({
		...rest,
		Metrics: Metrics.map(metric => ({
			Unit: METRIC_UNITS.Count,
			...typeof metric === 'string' ? { Name: metric } : metric
		}))
	}));
};

/**
 * @private
 * @param {MetricDirective[]} metricDirectives
 */
const generateDataPointFields = metricDirectives => {

	const uniqueFields = new Set();

	metricDirectives.forEach(metricDirective => {
		metricDirective.Dimensions.forEach(dimensionSet => {
			dimensionSet.forEach(dimensionField => uniqueFields.add(dimensionField));
		});
		metricDirective.Metrics.forEach(metricDefinition => {
			uniqueFields.add(metricDefinition.Name);
		});
	});

	return [...uniqueFields];
};

/**
 * A metric generator factory. This allows you to create metrics easily by setting up metric parameters once and isolated
 *
 * @param {MetricDirectiveInput|MetricDirectiveInput[]} metricOrMetricsArray An array of metric directives or metric names, or a single metric directive or metric name
 * @returns {MetricPointGenerator} A function to generate metric points
 */
const generateMetric = metricOrMetricsArray => {

	const normalizedMetrics = normalizeMetricDirectives(metricOrMetricsArray);

	const generatorFields = generateDataPointFields(normalizedMetrics);

	return (...generatorValues) => {
		// eslint-disable-next-line no-console
		console.log(JSON.stringify({
			_aws: {
				CloudWatchMetrics: normalizedMetrics,
				Timestamp: Date.now()
			},
			...generatorFields.reduce((accum, field, index) => {
				accum[field] = generatorValues[index];
				return accum;
			}, {})
		}));
	};
};

module.exports = generateMetric;

/**
 * @callback MetricPointGenerator
 * @param {...string} metricDataPoint An object with the data point values. The properties of the object must match the properties used in the Dimensions an Metric names
 * @returns {void}
 */

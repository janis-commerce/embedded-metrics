'use strict';

const { METRIC_UNITS } = require('./metric-units');

// https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html

// CloudWatch does not accept more than 100 numeric values for a single metric target on a single EMF line
const MAX_METRIC_VALUES_PER_LINE = 100;

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

/* eslint-disable max-len */
/**
 * @typedef {number|number[]} MetricValue The value of a single metric datapoint for a generator call. It can be:
 * - A number: a single datapoint (unchanged, historical behaviour)
 * - An array of numbers: multiple raw datapoints collected in memory (eg. during a batch) and reported in one generator call
 *
 * Every metric is chunked independently into EMF lines of at most 100 values, as required by CloudWatch (see [Specification](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html)).
 * An empty array is skipped: no datapoint is emitted for that metric, and no EMF line is emitted at all if every metric of a call ends up empty.
 *
 * Note the validation asymmetry between the two forms is deliberate, not an oversight: a scalar is passed through as-is, unvalidated, to preserve the
 * pre-existing (historical) behaviour of this package; an array, being a new surface, has every entry validated as a finite number
 */
/* eslint-enable max-len */

/**
 * @private
 * @param {MetricDirectiveInput|MetricDirectiveInput[]} metricOrMetricsArray
 * @returns {MetricDirective[]}
 */
const normalizeMetricDirectives = metricOrMetricsArray => {

	const metrics = Array.isArray(metricOrMetricsArray) ? metricOrMetricsArray : [metricOrMetricsArray];

	return metrics.map(({ Namespace, Dimensions, Metrics }) => ({
		Namespace,
		Dimensions: Dimensions || [],
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
 * @private
 * @param {MetricDirective[]} metricDirectives
 * @returns {Set<string>} The set of field names that are used as a Metric (as opposed to a Dimension) in at least one directive
 */
const getMetricFieldNames = metricDirectives => {

	const metricFieldNames = new Set();

	metricDirectives.forEach(metricDirective => {
		metricDirective.Metrics.forEach(metricDefinition => metricFieldNames.add(metricDefinition.Name));
	});

	return metricFieldNames;
};

/**
 * @private
 * @param {string} fieldName The metric name, used only to build a readable error message
 * @param {number[]} values
 */
const assertFiniteNumbers = (fieldName, values) => {
	values.forEach(value => {
		if(!Number.isFinite(value))
			throw new Error(`Invalid metric value for "${fieldName}": every value must be a finite number, received ${JSON.stringify(value)}`);
	});
};

/**
 * @private
 * Splits a non-empty list of raw metric values into chunks of at most MAX_METRIC_VALUES_PER_LINE, one chunk per EMF line that will report them
 * @param {number[]} values A non-empty list of values
 * @returns {number[][]}
 */
const chunkMetricValues = values => {

	const chunks = [];

	for(let chunkStart = 0; chunkStart < values.length; chunkStart += MAX_METRIC_VALUES_PER_LINE)
		chunks.push(values.slice(chunkStart, chunkStart + MAX_METRIC_VALUES_PER_LINE));

	return chunks;
};

/**
 * @private
 * Resolves a single metric field value, as received by the generator, into the ordered list of chunks that must be emitted for it.
 * A scalar value always resolves to exactly one chunk (unchanged, historical behaviour). An array resolves to zero (if empty) or more chunks,
 * one per EMF line that will report that metric
 * @param {string} fieldName
 * @param {MetricValue} metricValue
 * @returns {Array<number|number[]>}
 */
const resolveMetricValueChunks = (fieldName, metricValue) => {

	// An omitted generator argument is passed through as-is, preserving the pre-existing (unvalidated) behaviour
	if(metricValue === undefined)
		return [metricValue];

	if(typeof metricValue === 'number')
		return [metricValue];

	if(Array.isArray(metricValue)) {

		if(!metricValue.length)
			return [];

		assertFiniteNumbers(fieldName, metricValue);

		return chunkMetricValues(metricValue);
	}

	throw new Error(`Invalid metric value for "${fieldName}": expected a number or an array of numbers, received ${JSON.stringify(metricValue)}`);
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

	const metricFieldNames = getMetricFieldNames(normalizedMetrics);

	return (...generatorValues) => {

		const resolvedValues = generatorFields.reduce((resolvedFieldValues, field, index) => {
			resolvedFieldValues[field] = generatorValues[index];
			return resolvedFieldValues;
		}, {});

		const metricValueChunksByField = {};

		let totalChunks = 0;

		metricFieldNames.forEach(fieldName => {
			const chunks = resolveMetricValueChunks(fieldName, resolvedValues[fieldName]);
			metricValueChunksByField[fieldName] = chunks;
			if(chunks.length > totalChunks)
				totalChunks = chunks.length;
		});

		// Every metric resolved to zero chunks (eg. all of them received an empty array): nothing to emit
		if(!totalChunks)
			return;

		const timestamp = Date.now();

		for(let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {

			const dataPoint = {};
			const cloudWatchMetrics = [];

			normalizedMetrics.forEach(metricDirective => {

				const metricsInChunk = metricDirective.Metrics.filter(metricDefinition => (
					chunkIndex < metricValueChunksByField[metricDefinition.Name].length
				));

				// None of this directive's metrics have data for this chunk: skip it entirely for this EMF line
				if(!metricsInChunk.length)
					return;

				metricDirective.Dimensions.forEach(dimensionSet => {
					dimensionSet.forEach(dimensionField => {
						dataPoint[dimensionField] = resolvedValues[dimensionField];
					});
				});

				metricsInChunk.forEach(metricDefinition => {
					dataPoint[metricDefinition.Name] = metricValueChunksByField[metricDefinition.Name][chunkIndex];
				});

				cloudWatchMetrics.push({
					...metricDirective,
					Metrics: metricsInChunk
				});
			});

			// eslint-disable-next-line no-console
			console.log(JSON.stringify({
				_aws: {
					CloudWatchMetrics: cloudWatchMetrics,
					Timestamp: timestamp
				},
				...dataPoint
			}));
		}
	};
};

module.exports = generateMetric;

/* eslint-disable max-len */
/**
 * @callback MetricPointGenerator
 * @param {...(string|MetricValue)} dataPointValues The values for the fields declared by the metric directive(s), in order: for each directive, first
 * its Dimension names (values are always strings) and then its Metric names (values can be a {@link MetricValue}). A field used more than once across
 * directives must only be passed once, at the position of its first occurrence.
 *
 * A single call can emit more than one EMF line, since each metric is chunked independently (see {@link MetricValue}): dimensions are repeated on every
 * line that reports at least one metric, and a metric is only present on the lines it has data for. If every metric ends up empty, no line is emitted
 * @returns {void}
 */
/* eslint-enable max-len */

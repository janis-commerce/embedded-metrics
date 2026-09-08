# embedded-metrics

![Build Status](https://github.com/janis-commerce/embedded-metrics/workflows/Build%20Status/badge.svg)
[![Coverage Status](https://coveralls.io/repos/github/janis-commerce/embedded-metrics/badge.svg?branch=false)](https://coveralls.io/github/janis-commerce/embedded-metrics?branch=false)
[![npm version](https://badge.fury.io/js/%40janiscommerce%2Fembedded-metrics.svg)](https://www.npmjs.com/package/@janiscommerce/embedded-metrics)

A wrapper to make it easier to use [AWS Cloudwatch Embedded Metric Format](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html) (EMF)

## Installation
```sh
npm install @janiscommerce/embedded-metrics
```

## Usage
```js
const { generateMetric } = require('@janiscommerce/embedded-metrics');

// It is recommended to create the metric generators on their own files and import them when needed
const metricGenerator = generateMetric({
	Namespace: 'JanisCommerce/Something/Prod',
	Dimensions: [
		['clientCode']
	],
	Metrics: ['Success', 'Failure']
});

// clientCode = some-client
// Success = 10
// Failure = 20
// See Positional arguments below to understand generator arguments better
metricGenerator('some-client', 10, 20);

// Call this as many time as you want to register more metric with diferent Dimension value or different Data point values
metricGenerator('other-client', 15, 1);
```

**Defaults**
- Metrics `Unit` will be set to `Count`.
- Metrics `StorageResolution` will be set to `60` (Standard-resolution metric)

## Positional arguments

When creating a metric generator, it will accept as many arguments as needed based on the Metric Directive(s). The directives will be resolved in the following order:

1. For each Metric Directive:
	a. For each Dimension: Dimension name will be added as argument
	b. For each Metric: Metric Name will be added as argument

**Note**: If the same field is used multiple times, it will be added only once as argument.

## Aggregating multiple datapoints in a single call

A **Metric** value (not a Dimension value) doesn't have to be a single number: it can also be an **array of numbers**, to report several raw
datapoints collected in memory (eg. during a batch) in a single call. CloudWatch calculates `Average`, `Maximum`, `SampleCount` and percentiles the
same way it would if every datapoint had been reported in its own call.

```js
const durationMetricGenerator = generateMetric({
	Namespace: 'JanisCommerce/Something/Prod',
	Dimensions: [['clientCode']],
	Metrics: ['ProcessDurationMs']
});

// Collect every datapoint in memory during the batch...
const durations = [];
for (const item of batch) {
	const start = Date.now();
	await processItem(item);
	durations.push(Date.now() - start);
}

// ...and emit them all in a single call at the end of the batch
durationMetricGenerator('some-client', durations);
```

If durations are rounded to buckets to keep the in-memory accumulator small, expand each bucket to its raw occurrences before calling the generator
— the package only accepts plain numbers or arrays of numbers, it does **not** accept a `{ Values, Counts }`-style shape:

```js
const durationBuckets = {}; // roundedMs -> occurrences
for (const item of batch) {
	const start = Date.now();
	await processItem(item);
	const roundedMs = Math.round((Date.now() - start) / 50) * 50;
	durationBuckets[roundedMs] = (durationBuckets[roundedMs] || 0) + 1;
}

// Expand { roundedMs: occurrences } into the flat array the generator expects
const flat = Object.entries(durationBuckets).flatMap(([ms, count]) => Array(count).fill(Number(ms)));
durationMetricGenerator('some-client', flat);
```

**Automatic chunking**: CloudWatch does not accept more than 100 values for a single metric on a single EMF line. The generator splits the array into
chunks of at most 100 entries and emits one line per chunk automatically — the caller never needs to chunk the array itself, and there's no warning
or extra logging when it happens.

**Where the actual savings come from**: it's not from collapsing repeated values — CloudWatch's raw wire format for a metric is only ever a number or
a flat array of numbers, there's no server-side "value + count" shortcut, so the amount of emitted lines is always driven by the total amount of
datapoints divided by 100, regardless of how many of them repeat. The real saving is that a line's `_aws` envelope (Namespace, Dimensions, Metric
definitions, Timestamp) is fixed overhead paid **once per line**, not once per datapoint: reporting one datapoint per call, this package measured
~257 bytes for a single-metric, single-dimension line (mostly envelope); reporting 100 datapoints in one array on a single line measured ~655 bytes
total, ~6.5 bytes/datapoint. That's a **~97.5% reduction** in CloudWatch Logs ingestion — but that's the ceiling, only reached when a single call's
array actually fills up to 100 entries. Two consequences worth keeping in mind:
- Since chunking happens *within* a single call (a single combination of dimension values), a batch spread across many different dimension values
  (eg. many different `clientCode`s) yields many smaller arrays instead of one that reaches 100 — closer to the per-datapoint overhead of today than
  to the ~6.5 bytes/datapoint best case. Eg. the same 100 datapoints spread evenly across 10 dimension combinations (10 datapoints per line, 10 lines)
  measured only a ~89% reduction. A batch concentrated on fewer dimension combinations benefits the most.
- Rounding to coarser buckets doesn't reduce the amount of emitted lines by itself; it only makes the caller's own in-memory accumulator (the bucket
  map) smaller and cheaper to build than pushing every raw value into an array.

**Multiple metrics with a different amount of datapoints in the same call**: each metric is chunked independently, based on its own length. If a call
emits more than one EMF line, a metric that runs out of chunks before the others simply stops appearing on the following lines (it does not repeat
its last chunk, nor does it get padded). Dimensions are repeated on every line that reports at least one metric.

**Empty arrays are skipped, not an error**: an empty array means "no datapoints to report for this metric this time" — the metric is simply omitted
from the output. If every metric of a call resolves to an empty array, no EMF line is emitted at all. This makes it safe to call the generator
unconditionally at the end of a batch, even when the batch had zero items to report.

## Examples

```js
const { generateMetric } = require('@janiscommerce/embedded-metrics');

// Multiple Metric Directives with repeated fields
const metricGenerator = generateMetric([
	{
		Namespace: 'JanisCommerce/Something/Prod',
		Dimensions: [
			['clientCode'] // <- args[0]
		],
		Metrics: ['Success', 'Failure'] // <- args[1] and args[2]
	},
	{
		Namespace: 'JanisCommerce/SomethingElse/Prod',
		Dimensions: [
			['clientCode'] // <- args[0] (already set)
		],
		Metrics: ['Failure', 'Warning', 'Success'] // <- args[1] (already set), args[3] and args[2] (already set)
	}
]);

// clientCode = some-client
// Success = 10
// Failure = 20
// Warning = 20
metricGenerator('some-client', 10, 20, 30);
```
<details>
	<summary>See generated metric</summary>

	```json
	{
		"_aws": {
			"CloudWatchMetrics": [
				{
					"Namespace": "JanisCommerce/Something/Prod",
					"Dimensions": [
						[
							"clientCode"
						]
					],
					"Metrics": [
						{
							"Unit": "Count",
							"Name": "Success"
						},
						{
							"Unit": "Count",
							"Name": "Failure"
						}
					]
				},
				{
					"Namespace": "JanisCommerce/SomethingElse/Prod",
					"Dimensions": [
						[
							"clientCode"
						]
					],
					"Metrics": [
						{
							"Unit": "Count",
							"Name": "Failure"
						},
						{
							"Unit": "Count",
							"Name": "Warning"
						},
						{
							"Unit": "Count",
							"Name": "Success"
						}
					]
				}
			],
			"Timestamp": 1676499226877
		},
		"clientCode": "some-client",
		"Success": 10,
		"Failure": 20,
		"Warning": 30
	}
	```
</details>

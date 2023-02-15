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

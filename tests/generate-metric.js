'use strict';

/* eslint-disable no-console */

const assert = require('assert');

const sinon = require('sinon');

const { generateMetric, METRIC_RESOLUTIONS } = require('..');
const { METRIC_UNITS } = require('../lib/metric-units');

describe('generateMetric()', () => {

	const fakeNow = Date.now();

	beforeEach(() => {
		sinon.useFakeTimers(fakeNow);
		sinon.stub(console, 'log');
	});

	afterEach(() => sinon.restore());

	const clientCode = 'fizzmodarg';

	const fullMetricDirective = ({
		metricUnit,
		metricResolution,
		dimensions
	} = {}) => {

		const Unit = metricUnit ?? 'Count';
		const Dimensions = dimensions ?? [
			['clientCode']
		];

		return {
			Namespace: 'Sample',
			...Dimensions && { Dimensions },
			Metrics: [{
				Name: 'PublishedProducts',
				...Unit && { Unit },
				...metricResolution && { StorageResolution: metricResolution }
			}]
		};
	};

	const fullMetricDirectiveOutput = ({
		metricUnit,
		metricResolution,
		dimensions
	} = {}) => ({
		_aws: {
			CloudWatchMetrics: [{
				Namespace: 'Sample',
				Dimensions: dimensions || [
					['clientCode']
				],
				Metrics: [{
					Unit: metricUnit || 'Count',
					Name: 'PublishedProducts',
					...metricResolution && { StorageResolution: metricResolution }
				}]
			}],
			Timestamp: fakeNow
		},
		clientCode,
		PublishedProducts: 10
	});

	it('Should return a generator function', () => {
		const generator = generateMetric(fullMetricDirective());
		assert.strictEqual(typeof generator, 'function');
	});

	describe('Metric generator', () => {

		it('Should write a metric directive as-is if it is passed as an array and fully compliant with the specification', () => {
			const generator = generateMetric([fullMetricDirective()]);
			generator(clientCode, 10);

			sinon.assert.calledOnceWithExactly(console.log, JSON.stringify(fullMetricDirectiveOutput()));
		});

		it('Should write a metric directive as an array if it is passed as an object and fully compliant with the specification', () => {
			const generator = generateMetric(fullMetricDirective());
			generator(clientCode, 10);

			sinon.assert.calledOnceWithExactly(console.log, JSON.stringify(fullMetricDirectiveOutput()));
		});

		it('Should add default metric unit to Count if it is not passed', () => {
			const generator = generateMetric(fullMetricDirective({ metricUnit: false }));
			generator(clientCode, 10);

			sinon.assert.calledOnceWithExactly(console.log, JSON.stringify(fullMetricDirectiveOutput()));
		});

		it('Should add an empty Dimensions array if Dimensions are not passed', () => {
			const generator = generateMetric(fullMetricDirective({ dimensions: false }));
			generator(10);

			const { clientCode: _, ...expectedOutput } = fullMetricDirectiveOutput({ dimensions: [] });
			sinon.assert.calledOnceWithExactly(console.log, JSON.stringify(expectedOutput));
		});

		it('Should honor a custom metric unit if it is passed', () => {
			const generator = generateMetric(fullMetricDirective({ metricUnit: METRIC_UNITS.Bits }));
			generator(clientCode, 10);

			sinon.assert.calledOnceWithExactly(console.log, JSON.stringify(fullMetricDirectiveOutput({ metricUnit: METRIC_UNITS.Bits })));
		});

		it('Should honor a custom metric storage resolution if it is passed', () => {
			const generator = generateMetric(fullMetricDirective({ metricResolution: METRIC_RESOLUTIONS.High }));
			generator(clientCode, 10);

			sinon.assert.calledOnceWithExactly(console.log, JSON.stringify(fullMetricDirectiveOutput({ metricResolution: METRIC_RESOLUTIONS.High })));
		});

		it('Should generate the formatted metric using the generator arguments based on directive fields declaration', () => {

			// Expected order:
			// For each metric directive, it should use the Dimensions first (in order) and the Metrics.x.Name second (in order)
			// If a field is used more than once, it should not be required more than once by the generator
			const generator = generateMetric([
				{
					Namespace: 'Sample',
					Dimensions: [
						['clientCode']
					],
					Metrics: [{
						Name: 'PublishedProducts'
					}, 'FailedProducts']
				},
				{
					Namespace: 'AnotherNamespace',
					Dimensions: [
						['clientCode']
					],
					Metrics: ['FailedProducts', 'WarningProducts', 'PublishedProducts']
				}
			]);

			generator(clientCode, 10, 20, 30);

			sinon.assert.calledOnceWithExactly(console.log, JSON.stringify({
				_aws: {
					CloudWatchMetrics: [
						{
							Namespace: 'Sample',
							Dimensions: [
								['clientCode']
							],
							Metrics: [{
								Unit: 'Count',
								Name: 'PublishedProducts'
							}, {
								Unit: 'Count',
								Name: 'FailedProducts'
							}]
						},
						{
							Namespace: 'AnotherNamespace',
							Dimensions: [
								['clientCode']
							],
							Metrics: [{
								Unit: 'Count',
								Name: 'FailedProducts'
							}, {
								Unit: 'Count',
								Name: 'WarningProducts'
							}, {
								Unit: 'Count',
								Name: 'PublishedProducts'
							}]
						}
					],
					Timestamp: fakeNow
				},
				clientCode,
				PublishedProducts: 10,
				FailedProducts: 20,
				WarningProducts: 30
			}));
		});
	});

});

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

	describe('Metric generator with array metric values', () => {

		it('Should emit the array as-is as the metric value when it has at most 100 entries', () => {

			const generator = generateMetric({
				Namespace: 'Sample',
				Dimensions: [['clientCode']],
				Metrics: ['DurationMs']
			});

			generator(clientCode, [412, 388, 1204]);

			sinon.assert.calledOnceWithExactly(console.log, JSON.stringify({
				_aws: {
					CloudWatchMetrics: [{
						Namespace: 'Sample',
						Dimensions: [['clientCode']],
						Metrics: [{ Unit: 'Count', Name: 'DurationMs' }]
					}],
					Timestamp: fakeNow
				},
				clientCode,
				DurationMs: [412, 388, 1204]
			}));
		});

		it('Should emit a single-entry array as-is, not unwrapped into a scalar', () => {

			const generator = generateMetric({
				Namespace: 'Sample',
				Dimensions: [['clientCode']],
				Metrics: ['DurationMs']
			});

			generator(clientCode, [412]);

			sinon.assert.calledOnce(console.log);

			const emitted = JSON.parse(console.log.getCall(0).args[0]);

			assert.deepStrictEqual(emitted.DurationMs, [412]);
			assert.strictEqual(Array.isArray(emitted.DurationMs), true);
		});

		it('Should emit a single EMF line when the array has exactly 100 entries', () => {

			const values = Array.from({ length: 100 }, (_, index) => index + 1);

			const generator = generateMetric({ Namespace: 'Sample', Metrics: ['DurationMs'] });

			generator(values);

			sinon.assert.calledOnce(console.log);

			const [emittedLine] = console.log.getCall(0).args;
			assert.deepStrictEqual(JSON.parse(emittedLine).DurationMs, values);
		});

		it('Should split the array into multiple EMF lines of at most 100 entries when it has more than 100 entries', () => {

			const values = Array.from({ length: 101 }, (_, index) => index + 1);

			const generator = generateMetric({ Namespace: 'Sample', Metrics: ['DurationMs'] });

			generator(values);

			sinon.assert.calledTwice(console.log);

			const firstLine = JSON.parse(console.log.getCall(0).args[0]);
			const secondLine = JSON.parse(console.log.getCall(1).args[0]);

			const { _aws: firstLineMetadata } = firstLine;
			const { _aws: secondLineMetadata } = secondLine;

			assert.deepStrictEqual(firstLine.DurationMs, values.slice(0, 100));
			assert.deepStrictEqual(secondLine.DurationMs, [values[100]]);
			assert.strictEqual(firstLineMetadata.Timestamp, fakeNow);
			assert.strictEqual(secondLineMetadata.Timestamp, fakeNow);
		});

		it('Should not emit any EMF line when the array is empty', () => {

			const generator = generateMetric({ Namespace: 'Sample', Metrics: ['DurationMs'] });

			generator([]);

			sinon.assert.notCalled(console.log);
		});

		it('Should throw when the array contains a non-numeric value', () => {

			const generator = generateMetric({ Namespace: 'Sample', Metrics: ['DurationMs'] });

			assert.throws(() => generator([412, 'not-a-number']), /DurationMs/);
		});
	});

	describe('Metric generator value type validation', () => {

		it('Should throw when a metric value is not a number or an array of numbers', () => {

			const generator = generateMetric({ Namespace: 'Sample', Metrics: ['DurationMs'] });

			assert.throws(() => generator('not-a-valid-value'), /DurationMs/);
			assert.throws(() => generator(true), /DurationMs/);
			assert.throws(() => generator(null), /DurationMs/);
			assert.throws(() => generator({ Values: [410], Counts: [1] }), /DurationMs/);
		});

		it('Should pass an omitted metric argument through as-is, matching the pre-existing (unvalidated) behaviour', () => {

			const generator = generateMetric({ Namespace: 'Sample', Metrics: ['DurationMs'] });

			generator();

			sinon.assert.calledOnce(console.log);

			const emitted = JSON.parse(console.log.getCall(0).args[0]);
			assert.strictEqual('DurationMs' in emitted, false);
		});
	});

	describe('Metric generator chunking with multiple metrics of different lengths', () => {

		it('Should chunk each metric independently, keeping a metric out of a line entirely once its own data is exhausted', () => {

			const generator = generateMetric({
				Namespace: 'Sample',
				Dimensions: [['clientCode']],
				Metrics: ['LongMetric', 'ShortMetric']
			});

			const longValues = Array.from({ length: 150 }, (_, index) => index + 1); // needs 2 chunks: 100 + 50
			const shortValues = Array.from({ length: 30 }, (_, index) => index + 1); // needs 1 chunk

			generator(clientCode, longValues, shortValues);

			sinon.assert.calledTwice(console.log);

			const firstLine = JSON.parse(console.log.getCall(0).args[0]);
			const secondLine = JSON.parse(console.log.getCall(1).args[0]);

			const { _aws: firstLineMetadata } = firstLine;
			const { _aws: secondLineMetadata } = secondLine;

			assert.deepStrictEqual(firstLine.LongMetric, longValues.slice(0, 100));
			assert.deepStrictEqual(firstLine.ShortMetric, shortValues);
			assert.strictEqual(firstLine.clientCode, clientCode);
			assert.deepStrictEqual(
				firstLineMetadata.CloudWatchMetrics[0].Metrics.map(({ Name }) => Name),
				['LongMetric', 'ShortMetric']
			);

			assert.deepStrictEqual(secondLine.LongMetric, longValues.slice(100));
			assert.strictEqual('ShortMetric' in secondLine, false);
			assert.strictEqual(secondLine.clientCode, clientCode);
			assert.deepStrictEqual(
				secondLineMetadata.CloudWatchMetrics[0].Metrics.map(({ Name }) => Name),
				['LongMetric']
			);
		});

		it('Should omit a metric that resolves to an empty array while still emitting metrics that have data', () => {

			const generator = generateMetric({
				Namespace: 'Sample',
				Metrics: ['ImportedItems', 'ImportStockDurationMs']
			});

			// A batch with zero items: nothing to report for durations, but the counter itself is still a valid datapoint
			generator(0, []);

			sinon.assert.calledOnce(console.log);

			const emitted = JSON.parse(console.log.getCall(0).args[0]);

			const { _aws: emittedMetadata } = emitted;

			assert.strictEqual(emitted.ImportedItems, 0);
			assert.strictEqual('ImportStockDurationMs' in emitted, false);
			assert.deepStrictEqual(emittedMetadata.CloudWatchMetrics[0].Metrics.map(({ Name }) => Name), ['ImportedItems']);
		});

		it('Should not emit any EMF line when every metric of the call resolves to an empty array', () => {

			const generator = generateMetric({
				Namespace: 'Sample',
				Metrics: ['ImportStockDurationMs', 'PublishStockDurationMs']
			});

			generator([], []);

			sinon.assert.notCalled(console.log);
		});

		it('Should drop a directive and its own dimensions once its metrics run out of data, while another directive keeps reporting', () => {

			const warehouseId = 'wrh-1';

			const generator = generateMetric([
				{ Namespace: 'Sample', Dimensions: [['warehouseId']], Metrics: ['ShortMetric'] },
				{ Namespace: 'AnotherNamespace', Dimensions: [['clientCode']], Metrics: ['LongMetric'] }
			]);

			const shortValues = [1, 2, 3]; // needs 1 chunk
			const longValues = Array.from({ length: 150 }, (_, index) => index + 1); // needs 2 chunks: 100 + 50

			generator(warehouseId, shortValues, clientCode, longValues);

			sinon.assert.calledTwice(console.log);

			const firstLine = JSON.parse(console.log.getCall(0).args[0]);
			const secondLine = JSON.parse(console.log.getCall(1).args[0]);

			const { _aws: firstLineMetadata } = firstLine;
			const { _aws: secondLineMetadata } = secondLine;

			// First line: both directives are present, both dimensions and both metrics are reported
			assert.strictEqual(firstLineMetadata.CloudWatchMetrics.length, 2);
			assert.strictEqual(firstLine.warehouseId, warehouseId);
			assert.strictEqual(firstLine.clientCode, clientCode);
			assert.deepStrictEqual(firstLine.ShortMetric, shortValues);

			// Second line: the Sample directive is fully dropped (ShortMetric only had 1 chunk), taking its dimension with it
			assert.strictEqual(secondLineMetadata.CloudWatchMetrics.length, 1);
			assert.strictEqual(secondLineMetadata.CloudWatchMetrics[0].Namespace, 'AnotherNamespace');
			assert.strictEqual('ShortMetric' in secondLine, false);
			assert.strictEqual('warehouseId' in secondLine, false);

			// AnotherNamespace keeps reporting on the second line, with its own dimension untouched
			assert.strictEqual(secondLine.clientCode, clientCode);
			assert.deepStrictEqual(secondLine.LongMetric, longValues.slice(100));
		});
	});

});

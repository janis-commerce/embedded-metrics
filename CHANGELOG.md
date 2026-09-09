# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Metric values can now be an array of numbers, to report several datapoints in a single call [JCN-550](https://janiscommerce.atlassian.net/browse/JCN-550)
- Arrays longer than 100 values are automatically split into multiple EMF lines, as required by CloudWatch

## [1.0.1] - 2023-02-17
### Fixed
- Metrics without dimensions can now be published

## [1.0.0] - 2023-02-15
### Added
- First stable version of the package, generating AWS Cloudwatch EMF

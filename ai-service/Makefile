.PHONY: help test test-unit test-integration test-coverage lint format type-check install clean

help:
	@echo "Available commands:"
	@echo "  make install        - Install dependencies"
	@echo "  make test          - Run all tests"
	@echo "  make test-unit     - Run unit tests only"
	@echo "  make test-integration - Run integration tests only"
	@echo "  make test-coverage - Run tests with coverage report"
	@echo "  make lint          - Run linting checks"
	@echo "  make format        - Format code with black"
	@echo "  make type-check    - Run type checking with mypy"
	@echo "  make clean         - Clean up cache and temporary files"

install:
	pip install -r requirements.txt
	pip install -r requirements-dev.txt

test:
	pytest -v

test-unit:
	pytest -v -m unit tests/unit/

test-integration:
	pytest -v -m integration tests/integration/

test-coverage:
	pytest --cov=app --cov-report=html --cov-report=term-missing

test-ci:
	pytest --cov=app --cov-report=xml --cov-report=term-missing --junitxml=test-results.xml

lint:
	flake8 app tests
	pylint app tests

format:
	black app tests
	isort app tests

type-check:
	mypy app

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name "*.coverage" -delete
	rm -rf .pytest_cache
	rm -rf .mypy_cache
	rm -rf htmlcov
	rm -rf .coverage
	rm -rf test-results.xml
	rm -rf coverage.xml
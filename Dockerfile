# Build an image with Hermes Agent installed, for LATER deployment.
# During development you run Hermes locally (terminal.backend: local).
# The docker-compose deployment topology is planned in a later phase.
#
# NOTE: confirm the exact install command against the current install docs
# (https://hermes-agent.nousresearch.com/docs). This uses the documented
# clone + editable-install path, pinned to a release tag for reproducibility.

# Matches Hermes' default sandbox image (Python + Node available).
FROM nikolaik/python-nodejs:python3.11-nodejs20

ARG HERMES_VERSION=v0.14.0
ENV HERMES_HOME=/root/.hermes \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Install Hermes Agent (pinned)
RUN git clone --depth 1 --branch "${HERMES_VERSION}" \
      https://github.com/NousResearch/hermes-agent.git /opt/hermes-agent \
    && cd /opt/hermes-agent \
    && pip install -e .

# Project files
WORKDIR /workspace
COPY . /workspace

# Identity + config are mounted/managed at deploy time via $HERMES_HOME.
# Provide secrets at runtime (e.g. --env-file), never bake them into the image.

ENTRYPOINT ["hermes"]

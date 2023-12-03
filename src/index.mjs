import { getInput, setFailed } from "@actions/core";
import { getOctokit, context } from "@actions/github";

async function run() {
  let pullRequestInfo;
  try {
    pullRequestInfo = getPullRequestInfo();
  } catch (error) {
    console.info(error.message);
    return;
  }

  // get inputs
  let inputs;
  try {
    inputs = getInputs(process.env.ASSIGN_MAPPINGS !== undefined);
  } catch (error) {
    setFailed(`setting is invalid: ${error.message}`);

    return;
  }

  // decide reviewers
  let reviewer;
  try {
    reviewer = findReviewerByLabels(
      pullRequestInfo.labels,
      inputs.assignMappingsStr,
      (max) => Math.floor(Math.random() * max)
    );
    if (reviewer.length === 0) {
      console.info("No reviewer found.");
      return;
    }
  } catch (error) {
    setFailed(`finding reviewers is failed: ${error.message}`);
  }

  // request reviewers to pull request
  const octokit = getOctokit(token);
  try {
    await octokit.rest.pulls.requestReviewers({
      owner: pullRequestInfo.ownerName,
      repo: pullRequestInfo.repoName,
      pull_number: pullRequestInfo.pullRequestNumber,
      reviewers: [reviewer],
    });
  } catch (error) {
    setFailed(`requesting reviewers is failed: ${error.message}`);
  }
}

/**
 * @returns {{labels: string[], pullRequestNumber: number, ownerName: string, repoName: string}}
 */
function getPullRequestInfo() {
  const pullRequest = context.payload.pull_request;
  if (!pullRequest) {
    throw new Error("No pull request found.");
  }
  if (pullRequest.draft) {
    throw new Error(
      "No reviewer is assigned because the pull request is draft."
    );
  }

  return {
    labels: pullRequest.labels.map((label) => label.name),
    pullRequestNumber: pullRequest.number,
    ownerName: context.repo.owner,
    repoName: context.repo.repo,
  };
}

/**
 * @returns {{assignMappingsStr: string, githubToken: string}}
 */
function getInputs(isDev) {
  if (isDev) {
    return {
      assignMappingsStr: process.env.ASSIGN_MAPPINGS,
      githubToken: process.env.GITHUB_TOKEN,
    };
  }

  const assignMappingsStr = getInput("assign-mappings", { required: true });
  const githubToken = getInput("githubToken", { required: true });

  return { assignMappingsStr, githubToken };
}

/**
 *
 * @param {string[]} labels e.g. ["label1", "label2"]
 * @param {string} assignMappingsStr e.g. "label1:[reviewer1,reviewer2],label2:[reviewer3]"
 * @param {(max: number) => number} getRandomInt
 * @return {string | undefined} reviewer
 */
export function findReviewerByLabels(labels, assignMappingsStr, getRandomInt) {
  if (labels.length === 0) return undefined;

  const labelsMapping = parseLabelsInput(assignMappingsStr);

  return selectRandomlyReviewersByLabels(labels, labelsMapping, getRandomInt);
}

/**
 *
 * @param {string} input e.g. "label1:[reviewer1,reviewer2],label2:[reviewer3]"
 * @returns {{[label: string]: string[]}}
 */
export function parseLabelsInput(input) {
  const pairStrs = splitPairs(input);

  return Object.fromEntries(pairStrs.map(convertIntoLabelAndReviewers));
}

/**
 * @param {string} pairStr e.g. "label1:[reviewer1,reviewer2]"
 * @returns {[string, string[]]} [label, reviewers]
 */
function convertIntoLabelAndReviewers(pairStr) {
  const [label, reviewers] = pairStr.split(":");
  if (!label || !reviewers) {
    throw new Error(
      `Each pair must be in the format "label1:[reviewer1,reviewer2]".`
    );
  }

  const normalizedLabel = label.trim();

  if (!normalizedLabel) {
    throw new Error(
      `label must not be empty. Each pair must be in the format "label1:[reviewer1,reviewer2]".`
    );
  }

  if (!/^\[.*\]$/.test(reviewers)) {
    throw new Error(
      `Each pair must be in the format "label1:[reviewer1,reviewer2]".`
    );
  }

  const normalizedReviewers = reviewers
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((reviewer) => reviewer.trim())
    .filter((reviewer) => !!reviewer);

  if (!normalizedReviewers.length) {
    throw new Error(
      `reviewers must not be empty. Each pair must be in the format "label1:[reviewer1,reviewer2]".`
    );
  }

  return [normalizedLabel, normalizedReviewers];
}

/**
 * @param {string} input e.g. "label1:[reviewer1,reviewer2],label2:[reviewer3]"
 * @returns {string[]} e.g. ["label1:[reviewer1,reviewer2]", "label2:[reviewer3]"]
 */
function splitPairs(input) {
  const regexp = /([^,]+:[^\]]+\])/g;
  const matches = input.match(regexp);
  if (!matches) {
    throw new Error(
      `Each pair must be in the format "label1:[reviewer1,reviewer2]".`
    );
  }

  return matches;
}

/**
 * @param {string[]} labels
 * @param {{[label: string]: string[]}} labelsMapping
 * @param {(max: number) => number} getRandomInt
 * @returns {string | undefined}
 */
export function selectRandomlyReviewersByLabels(
  labels,
  labelsMapping,
  getRandomInt
) {
  const reviewerCandidates = labels.flatMap((label) => labelsMapping[label]);

  if (!reviewerCandidates.length) {
    return undefined;
  }

  return reviewerCandidates[getRandomInt(reviewerCandidates.length - 1)];
}

run();

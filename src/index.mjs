import { getInput, setFailed } from "@actions/core";
import { getOctokit, context } from "@actions/github";

async function run() {
  // get inputs
  let inputs;
  try {
    inputs = getInputs(process.env.ASSIGN_MAPPINGS !== undefined);
  } catch (error) {
    setFailed(`setting is invalid: ${error.message}`);

    return;
  }

  let pullRequestInfo;
  try {
    pullRequestInfo = getPullRequestInfo(inputs.pullRequestNumber);
  } catch (error) {
    console.info(error.message);
    return;
  }

  // decide reviewers
  let reviewer;
  try {
    reviewer = findReviewerByLabels(
      pullRequestInfo.labels,
      inputs.assignMappingsStr,
      [pullRequestInfo.author],
      (max) => Math.floor(Math.random() * max)
    );
    if (!reviewer) {
      console.info("No reviewer found.");
      return;
    }
  } catch (error) {
    setFailed(`finding reviewers is failed: ${error.message}`);

    return;
  }

  // request reviewers to pull request
  const octokit = getOctokit(inputs.githubToken);
  try {
    await octokit.rest.pulls.requestReviewers({
      owner: pullRequestInfo.ownerName,
      repo: pullRequestInfo.repoName,
      pull_number: pullRequestInfo.pullRequestNumber,
      reviewers: [reviewer],
    });
  } catch (error) {
    setFailed(`requesting reviewers is failed: ${error.message}`);

    return;
  }
}

/**
 * @param {number | undefined} pullRequestNumber
 * @returns {{labels: string[], pullRequestNumber: number, ownerName: string, repoName: string; author: string}}
 */
function getPullRequestInfo(pullRequestNumber) {
  let pullRequest = context.payload.pull_request;
  if (pullRequestNumber !== undefined) {
    pullRequest = context.payload.pull_requests.find(
      (pr) => pr.number === pullRequestNumber
    );
  }
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
    author: pullRequest.user.login,
  };
}

/**
 * @returns {{assignMappingsStr: string, githubToken: string, pullRequestNumber: number | undefined}}
 */
function getInputs(isDev) {
  if (isDev) {
    return {
      assignMappingsStr: process.env.ASSIGN_MAPPINGS,
      githubToken: process.env.GITHUB_TOKEN,
      pullRequestNumber: process.env.PULL_REQUEST_NUMBER
        ? Number(process.env.PULL_REQUEST_NUMBER)
        : undefined,
    };
  }

  const assignMappingsStr = getInput("assign-mappings", { required: true });
  const githubToken = getInput("githubToken", { required: true });
  const pullRequestNumber = getInput("pull-request-number");

  return {
    assignMappingsStr,
    githubToken,
    pullRequestNumber: pullRequestNumber
      ? Number(pullRequestNumber)
      : undefined,
  };
}

/**
 *
 * @param {string[]} labels e.g. ["label1", "label2"]
 * @param {string} assignMappingsStr e.g. "label1:[reviewer1,reviewer2],label2:[reviewer3]"
 * @param {string[]} ignoreUsers
 * @param {(max: number) => number} getRandomInt
 * @return {string | undefined} reviewer
 */
export function findReviewerByLabels(
  labels,
  assignMappingsStr,
  ignoreUsers,
  getRandomInt
) {
  if (labels.length === 0) return undefined;

  const labelsMapping = parseLabelsInput(assignMappingsStr);

  return selectRandomlyReviewersByLabels(
    labels,
    labelsMapping,
    ignoreUsers,
    getRandomInt
  );
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
 * @param {string[]} ignoreUsers
 * @param {(max: number) => number} getRandomInt
 * @returns {string | undefined}
 */
export function selectRandomlyReviewersByLabels(
  labels,
  labelsMapping,
  ignoreUsers,
  getRandomInt
) {
  const reviewerCandidates = labels
    .flatMap((label) => labelsMapping[label])
    .filter((reviewer) => !ignoreUsers.includes(reviewer));

  if (!reviewerCandidates.length) {
    return undefined;
  }

  return reviewerCandidates[getRandomInt(reviewerCandidates.length - 1)];
}

run();

// Lumen server: Approval stamps and labels written into a lifecycle stage's output file.
const fs = require('fs');

function stampOutput(stage, approvedBy, approvedAt) {
  const contents = fs.readFileSync(stage.outputPath, 'utf8').replace(/^> Approved by .* on .*\r?\n(?:\r?\n)?/, '');
  fs.writeFileSync(stage.outputPath, `> Approved by ${approvedBy.replace(/[\r\n]/g, ' ')} on ${new Date(approvedAt).toISOString()}\n\n${contents}`);
}

function labelUnapproved(stage) {
  const text = fs.readFileSync(stage.outputPath, 'utf8');
  if (!text.includes('> Based on unapproved inputs')) fs.writeFileSync(stage.outputPath, `> Based on unapproved inputs\n\n${text}`);
}
function clearUnapproved(stage) {
  const text = fs.readFileSync(stage.outputPath, 'utf8');
  const clean = text.replace(/^> Based on unapproved inputs\r?\n(?:\r?\n)?/, '');
  if (clean !== text) fs.writeFileSync(stage.outputPath, clean);
}

module.exports = { clearUnapproved, labelUnapproved, stampOutput };

/** TEMPORARY diagnostic — plain CommonJS, no TypeScript at all. */
module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ pong: true, via: "cjs", node: process.version }));
};

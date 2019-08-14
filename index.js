const t = require("@babel/types");
const { readFileSync } = require("fs");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const { codeFrameColumns } = require('@babel/code-frame');

const [ ,,filename ] = process.argv;
const code = readFileSync(filename, "utf8");

let ast;

try {
  ast = parse(code, {
    sourceType: "module",
    sourceFilename: filename,
    strictMode: true,
  });
} catch (e) {
  console.log(codeFrameColumns(code, e.loc));
  console.log(e.message);
  process.exit(1);
}

traverse(ast, {
  Program(path) {
    const {directives} = path.node;

    directives.forEach(({value}) => {
      if (t.isDirectiveLiteral(value, { value: "use strict" })) {
        console.log("ignore; strict mode enabled.");
        path.stop();
      }
    });
  },

  AssignmentExpression(path) {
    if (!t.isIdentifier(path.node.left)) {
      // ignore MemberExpression and other non identifier
      return;
    }

    const identifier = path.node.left;

    // typeof  __e  === "number" && (__e = n)
    if (t.isLogicalExpression(path.parentPath.node)) {
      const logicalExpressionLeft = path.parentPath.node.left;
      if (t.isBinaryExpression(logicalExpressionLeft, { operator: "==" })
        || t.isBinaryExpression(logicalExpressionLeft, { operator: "===" })) {
        const {left, right} = logicalExpressionLeft;

        // "string" === typeof x
        const isRightTypeOf = t.isUnaryExpression(right, { operator: "typeof" });
        const isLeftStringNotUndefined = t.isStringLiteral(left)
          && left.value !== "undefined";

        // typeof x === "string"
        const isLeftTypeOf = t.isUnaryExpression(left, { operator: "typeof" });
        const isRightStringNotUndefined = t.isStringLiteral(right)
          && right.value !== "undefined";

        if ((isRightTypeOf && isLeftStringNotUndefined)
          || (isLeftTypeOf && isRightStringNotUndefined)) {
          // there's a typeof check before, skip.
          return;
        }
      }
    }

    if (path.scope.bindings[identifier.name] !== undefined) {
      // has binding in current scope
      foundDeclaration = true;
    } else {
      // else, recursively find binding in parent scopes
      // FIXME(sven): how should it work with Worker bindins?
      foundDeclaration = path.findParent(parentPath => {
        return parentPath.scope.bindings[identifier.name];
      }) !== null;
    }

    if (!foundDeclaration) {
      const hasTryCatch = path.findParent(parentPath => {
        return t.isTryStatement(parentPath.node);
      });

      // error will be catched
      // FIXME: hopefully not rethrown...
      if (hasTryCatch) {
        return;
      }

      showError("undeclared assignement", path);
    }
  },

  FunctionDeclaration(path) {
    const {body, id} = path.node;
    const funcName = id.name;

    traverse(body, {
      MemberExpression(path) {
        const {object, property} = path.node;

        // find `arguments.callee` access
        if (t.isIdentifier(object, { name: "arguments" })
          && t.isIdentifier(property, { name: "callee" })) {
          showError(`potentially illegal ${path.toString()} usage`, path);
        }

        // find `FUNCTION_NAME.caller` access
        if (t.isIdentifier(object, { name: funcName })
          && t.isIdentifier(property, { name: "caller" })) {
          showError(`potentially illegal ${path.toString()} usage`, path);
        }
      }
    }, {}, path.scope);
  }
});

function showError(message, path) {
  console.log(codeFrameColumns(code, path.node.loc));
  console.log(message, "\n");
}

var Type = (function () {
  function type(name, size, defaultValue) {
    this.name = name;
    this.size = size;
    this.defaultValue = defaultValue;
  };

  type.prototype.toString = function () {
    return this.name;
  };

  type.prototype.toJSON = function () {
    return this.name;
  };

  type.prototype.getSize = function () {
    if (this.size) {
      return this.size;
    }
    assert (this.fields);
    var size = 0;
    this.fields.forEach(function (field) {
      size += field.type.getSize();
    });
    this.size = size;
    return size;
  };

  type.prototype.assignableFrom = function (other) {
    if (other === types.void) {
      return true;
    }
    return this === other;
  };

  type.prototype.addField = function addField(name, type) {
    if (!this.fields) {
      this.fields = [];
      this.offset = 0;
    }
    this.fields.push({name: name, type: type, offset: this.offset});
    this.offset += type.getSize();
  };

  type.prototype.getField = function getField(name) {
    var fields = this.fields;
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].name === name) {
        return fields[i];
      }
    }
    return null;
  };

  return type;
})();

var PointerType = (function () {
  function pointerType(type) {
    this.type = type;
    if (type instanceof pointerType) {
      this.base = type.base;
      this.pointers = type.pointers + 1;
    } else {
      this.base = type;
      this.pointers = 0;
    }
  };
  function stars(n) {
    var str = "";
    while (n--) {
      str += "*";
    }
    return str;
  }

  pointerType.prototype.defaultValue = 0;

  pointerType.prototype.toString = function () {
    if (this.name) {
      return this.name;
    }
    if (this.type instanceof FunctionType) {
      return this.name = this.type.returnType.toString() + "(*)" + "(" + this.type.parameterTypes.join(", ") + ")";
    } else {
      return this.name = this.type.toString() + "*";
    }
  };
  pointerType.prototype.toJSON = function () {
    return this.toString();
  };
  pointerType.prototype.getSize = function () {
    return 4;
  };
  pointerType.prototype.assignableFrom = function (other) {
    if (other === types.void) {
      return true;
    }
    if (other === types.null) {
      return true;
    }
    return other instanceof PointerType && this.base.assignableFrom(other.base) && this.pointers === other.pointers;
  };
  return pointerType;
})();

var FunctionType = (function () {
  function functionType(returnType, parameterTypes) {
    this.returnType = returnType;
    this.parameterTypes = parameterTypes;
  }
  functionType.prototype.toString = function () {
    return this.name || (this.name = this.returnType + "(" + this.parameterTypes.join(", ") + ")");
  };
  functionType.prototype.toJSON = function () {
    return this.toString();
  };
  functionType.prototype.assignableFrom = function (other) {
    if (other === types.void) {
      return true;
    }
    if (other === types.null) {
      return true;
    }
    return other instanceof FunctionType;
  };
  functionType.prototype.getSize = function () {
    return 4;
  };
  return functionType;
})();

var types = {
  int:  new Type("int",  4, 0),
  uint: new Type("uint", 4, 0),

  u8:   new Type("u8",   1, 0),
  i8:   new Type("i8",   1, 0),
  u16:  new Type("u16",  2, 0),
  i16:  new Type("i16",  2, 0),
  u32:  new Type("u32",  4, 0),
  i32:  new Type("i32",  4, 0),

  void: new Type("void", undefined, 0),
  dyn:  new Type("dyn",  undefined, 0)
};

function getType(name) {
  assert (name in types, "Type \"" + name + "\" is not found.");
  assert (types[name]);
  return types[name];
}

var Scope = (function () {
  function scope(parent, name) {
    this.name = name;
    this.parent = parent;
    this.symbols = {};
    this.symbolList = [];
    // Useful for 
    this.options = parent ? Object.create(parent.options) : {};
  }

  scope.prototype.get = function get(name, strict) {
    var symbol = this.symbols[name];
    if (symbol) {
      return symbol;
    } else if (this.parent) {
      return this.parent.get(name, strict);
    }
    if (strict) {
      return unexpected ("Undefined symbol " + name);
    }
    return null;
  };

  scope.prototype.add = function add(name, symbol) {
    assert (name);
    print("Adding name: " + name + ", symbol: " + symbol + " to scope " + this + ".");
    this.symbols[name] = symbol;
    this.symbolList.push({name: name, symbol: symbol});
  };

  scope.prototype.toString = function toString() {
    return this.name;
  };

  return scope;
})();


var Frame = (function () {
  function frame() {
    this.variables = [];
    this.size = 0;
  }
  frame.prototype.add = function add (variable) {
    assert (variable instanceof Variable);
    this.variables.push(variable);
    variable.offset = this.size;
    this.size += variable.type.getSize();
  };
  return frame;
})();


function walkComputeTypes(nodes, o) {
  return nodes.map(function (x) {
    assert ("computeType" in x, "Node: " + x.tag + " doesn't have a computeType function.");
    return x.computeType(o);
  });
}

function walkCreateTypes(nodes, o) {
  return nodes.map(function (x) {
    assert ("createType" in x, "Node: " + x.tag + " doesn't have a createType function.");
    return x.createType(o);
  });
}

function walkGenerateCode(nodes, writer, scope) {
  return nodes.map(function (x) {
    assert ("generateCode" in x, "Node: " + x.tag + " doesn't have a generateCode function.");
    return x.generateCode(writer, scope);
  });
}

function reportError(node, message) {
  var str = "";
  var position = node.position;

  if (position) {
    /*
     str = source.split("\n")[position.line - 1] + "\n";
     for (var i = 0; i < position.column - 1; i++) {
     str += " ";
     }
     str += "^ ";
     */
    str = "At " + position.line + ":" + position.column + ": " + node.tag + ": ";
  } else {
    str = "At " + node.tag + ": ";
  }

  throw new Error(str + message);
}

function checkTypeAssignment(node, a, b, message) {
  if (!a.assignableFrom(b)) {
    reportError(node, "Unassignable types " + a + " <= " + b + (message ? " " + message : ""));
  }
}

function check(node, condition, message) {
  if (!condition) {
    reportError(node, message);
  }
}

var Variable = (function () {
  function variable(name, type, offset) {
    assert (name && type);
    this.name = name;
    this.type = type;
    this.offset = offset;
  }
  variable.prototype.toString = function () {
    return "variable " + this.name;
  };
  return variable;
})();

function Program (elements) {
  this.tag = "Program";
  this.elements = elements;
}

Program.prototype = {
  computeType: function () {
    for (var i = 0; i < this.elements.length; i++) {
      var node = this.elements[i];
      if (node instanceof StructDeclaration) {
        assert (!(node.name in types), "Type " + node.name + " is already defined.");
        types[node.name] = new Type(node.name);
      }
    }
    var scope = new Scope(null, "Program");
    scope.add("extern", types.dyn);
    walkComputeTypes(this.elements, scope);
  },
  generateCode: function (writer) {
    var scope = new Scope(null, "Program");
    scope.add("extern", new Variable("extern", types.dyn));
    scope.options.frame = new Frame();
    walkGenerateCode(this.elements, writer, scope);
  }
};

function VariableStatement (typeSpecifier, variableDeclarations, inForStatement) {
  this.tag = "VariableStatement";
  this.typeSpecifier = typeSpecifier;
  this.variableDeclarations = variableDeclarations;
  this.inForStatement = inForStatement;
}

VariableStatement.prototype = {
  computeType: function (scope) {
    var typeSpecifier = this.typeSpecifier;
    this.variableDeclarations.forEach(function (x) {
      x.computeType(typeSpecifier, scope);
      scope.add(x.name, x.type);
    });
    delete this.typeSpecifier;
  },
  generateCode: function (writer, scope) {
    assert (scope);
    if (this.inForStatement) {
      var str = "var " +
        this.variableDeclarations.map(function (x) {
          var variable = new Variable(x.name, x.type);
          scope.add(x.name, variable);

          if (x.type.fields) {
            scope.options.frame.add(variable);
            var type = x.type;
            var size = x.type.getSize();
            if (x.value) {
              return "_ = " + generateMemoryCopy("FP + " + variable.offset, x.value.generateCode(null, scope), size);
            } else {
              return "_";
            }
          } else {
            if (x.value) {
              return x.name + " = " + x.value.generateCode(null, scope);
            } else {
              return x.name + " = " + x.type.defaultValue;
            }
          }
        }).join(", ");
      assert (!writer);
      return str;
    } else {
        this.variableDeclarations.forEach(function (x) {
          var variable = new Variable(x.name, x.type);
          scope.add(x.name, variable);

          if (x.type.fields) {
            scope.options.frame.add(variable);
            var type = x.type;
            var size = x.type.getSize();
            if (x.value) {
              writer.writeLn(generateMemoryCopy("FP + " + variable.offset, x.value.generateCode(null, scope), size) + ";");
            }
          } else {
            if (x.value) {
              writer.writeLn("var " +  x.name + " = " + x.value.generateCode(null, scope) + ";");
            } else {
              writer.writeLn("var " + x.name + " = " + x.type.defaultValue + ";");
            }
          }
        });
    }
  }
};

function VariableDeclaration (declarator, value) {
  this.tag = "VariableDeclaration";
  this.declarator = declarator;
  this.value = value;
}

VariableDeclaration.prototype = {
  computeType: function (typeSpecifier, scope) {
    var result = {name: null, type: getType(typeSpecifier)};
    this.declarator.createType(result);
    if (this.value) {
      var vt = this.value.computeType(scope);
      checkTypeAssignment(this, result.type, vt);
    }
    delete this.declarator;
    this.name = result.name;
    this.type = result.type;
  }
};

function Declarator (pointer, directDeclarator) {
  this.tag = "Declarator";
  this.pointer = pointer;
  this.directDeclarator = directDeclarator;
}

Declarator.prototype = {
  createType: function (result) {
    assert (result.type);
    if (this.pointer) {
      for (var i = 0; i < this.pointer.count; i++) {
        result.type = new PointerType(result.type);
      }
    }
    if (this.directDeclarator) {
      this.directDeclarator.createType(result);
    }
  }
};

function DirectDeclarator (name, declarator, declaratorSuffix) {
  this.tag = "DirectDeclarator";
  this.name = name;
  this.declarator = declarator;
  this.declaratorSuffix = declaratorSuffix;
}

DirectDeclarator.prototype = {
  createType: function (result) {
    assert (result.type);
    for (var i = this.declaratorSuffix.length - 1; i >= 0; i--) {
      result.type = this.declaratorSuffix[i].createType(result.type);
    }
    if (this.declarator) {
      this.declarator.createType(result);
    } else if (this.name) {
      result.name = this.name;
    }
  }
};

function FunctionDeclarator (parameters) {
  this.tag = "FunctionDeclarator";
  this.parameters = parameters;
}

FunctionDeclarator.prototype = {
  createType: function (returnType) {
    return new FunctionType(returnType, walkCreateTypes(this.parameters));
  },
  generateCode: function (writer, scope) {

  }
};

function ParameterDeclaration (typeSpecifier, declarator) {
  this.tag = "ParameterDeclaration";
  this.typeSpecifier = typeSpecifier;
  this.declarator = declarator;
}

ParameterDeclaration.prototype = {
  createType: function () {
    return this.createParameter().type;
  },
  createParameter: function () {
    var result = {name: null, type: getType(this.typeSpecifier)};
    if (this.declarator) {
      this.declarator.createType(result);
    }
    return result;
  }
};


function StructDeclaration (name, fields) {
  this.tag = "StructDeclaration";
  this.name = name;
  this.fields = fields;
}

StructDeclaration.prototype = {
  computeType: function () {
    this.type = getType(this.name);
    walkComputeTypes(this.fields, this.type);
  },
  generateCode: function (writer, scope) {}
};

function FieldDeclaration (typeSpecifier, declarator) {
  this.tag = "StructDeclaration";
  this.typeSpecifier = typeSpecifier;
  this.declarator = declarator;
}

FieldDeclaration.prototype = {
  computeType: function (type) {
    var result = {name: null, type: getType(this.typeSpecifier)};
    this.declarator.createType(result);
    type.addField(result.name, result.type);
  }
};

function TypeName (typeSpecifier, declarator) {
  this.tag = "TypeName";
  this.typeSpecifier = typeSpecifier;
  this.declarator = declarator;
}

TypeName.prototype = {
  createType: function () {
    var result = {name: null, type: getType(this.typeSpecifier)};
    if (this.declarator) {
      this.declarator.createType(result);
    }
    return result.type;
  }
};

function Literal (kind, value) {
  this.tag = "Literal";
  this.kind = kind;
  this.value = value;
}

Literal.prototype = {
  computeType: function () {
    switch (this.kind) {
      case "number": return types.int;
      case "boolean": return types.int;
      case "null": return types.null;
      case "string": return types.dyn;
      default: return notImplemented();
    }
  },
  generateCode: function (writer, scope) {
    assert(!writer);
     switch (this.kind) {
      case "number": return JSON.stringify(this.value);
      case "boolean": return JSON.stringify(this.value);
      case "null": return "null";
      case "string": return JSON.stringify(this.value);
      default: return notImplemented();
    }
  }
};

function FunctionDeclaration (name, returnType, parameters, elements) {
  this.tag = "FunctionDeclaration";
  this.name = name;
  this.returnType = returnType;
  this.parameters = parameters;
  this.elements = elements;
}

FunctionDeclaration.prototype = {
  computeType: function (scope) {
    this.parameters = this.parameters.map(function (x) {
      return x.createParameter();
    });
    var parameterTypes = this.parameters.map(function (x) {
      return x.type;
    });
    this.returnType = this.returnType.createType();
    this.type = new FunctionType(this.returnType, parameterTypes);

    scope = new Scope(scope, "type function " + this.name);
    scope.options.returnType = this.type.returnType;
    this.parameters.forEach(function (x) {
      scope.add(x.name, x.type);
    });

    walkComputeTypes(this.elements, scope);
  },
  generateCode: function (writer, scope) {
    scope = new Scope(scope, "code gen function " + this.name);
    scope.options.frame = new Frame();
    writer.enter("function " + this.name + "(" +
      this.parameters.map(function (x) {
        scope.add(x.name, new Variable(x.name, x.type, 0));
        return x.name;
      }).join(", ") + ") {");
    walkGenerateCode(this.elements, writer, scope);
    writer.leave("}");
/*
    o.scope.add(this.name, this.type);
    o = {scope: new Scope(o.scope, "function scope for " + this.name)};
    walk(this.parameters, match, o);
    writer.enter("function " + this.name + "(" +
                 this.parameters.map(function (x) {
                   o.scope.add(x.name, new Variable(x.name, x.type, 0));
                   return x.name;
                 }).join(", ") + ") {");
    walk(this.elements, match, o);
    writer.leave("}");
*/
  }
};

function ReturnStatement (value) {
  this.tag = "ReturnStatement";
  this.value = value;
}

ReturnStatement.prototype = {
  computeType: function (scope) {
    var type = this.value.computeType(scope);
    checkTypeAssignment(this, scope.options.returnType, type);
  },
  generateCode: function (writer, scope) {
    writer.writeLn("return" + (this.value ? " " + this.value.generateCode(null, scope) : "") + ";");
  }
};

function ConditionalExpression (condition, trueExpression, falseExpression) {
  this.tag = "ConditionalExpression";
  this.condition = condition;
  this.trueExpression = trueExpression;
  this.falseExpression = falseExpression;
}

ConditionalExpression.prototype = {
  computeType: function (scope) {
    var ct = this.condition.computeType(scope);
    var tt = this.trueExpression.computeType(scope);
    var ft = this.falseExpression.computeType(scope);
    return tt;
  },
  generateCode: function (writer, scope) {
    assert (!writer);
    return "(" + this.condition.generateCode(null, scope) + " ? " +
      this.trueExpression.generateCode(null, scope) + " : " +
      this.falseExpression.generateCode(null, scope) + ")";
  }
};

function BinaryExpression (operator, left, right) {
  this.tag = "BinaryExpression";
  this.operator = operator;
  this.left = left;
  this.right = right;
}

BinaryExpression.prototype = {
  computeType: function (scope) {
    var lt = this.left.computeType(scope);
    var rt =  this.right.computeType(scope);
    return lt;
  },
  generateCode: function (writer, scope) {
    assert (!writer);
    return "(" +
      this.left.generateCode(null, scope) + " " +
      this.operator + " " +
      this.right.generateCode(null, scope) +
    ")";
  }
};


function UnaryExpression (operator, expression) {
  this.tag = "UnaryExpression";
  this.operator = operator;
  this.expression = expression;
}

UnaryExpression.prototype = {
  computeType: function (scope) {
    this.expression.computeType(scope);
  },
  generateCode: function (writer, scope) {
    return this.operator + this.expression.generateCode(null, scope);
  }
};

function PostfixExpression (operator, expression) {
  this.tag = "PostfixExpression";
  this.operator = operator;
  this.expression = expression;
}

PostfixExpression.prototype = {
  computeType: function (scope) {
    this.expression.computeType(scope);
  },
  generateCode: function (writer, scope) {
    return this.expression.generateCode(null, scope) + this.operator;
  }
};

function FunctionCall (name, arguments) {
  this.tag = "FunctionCall";
  this.name = name;
  this.arguments = arguments;
}

FunctionCall.prototype = {
  computeType: function (scope) {
    this.name.computeType(scope);
    walkComputeTypes(this.arguments, scope);
  },
  generateCode: function (writer, scope) {
    // TODO: Apply scoping rules.
    return this.name.generateCode(null, scope) + "(" + walkGenerateCode(this.arguments, null, scope).join(", ") + ")";
  }
};

function VariableIdentifier (name) {
  this.tag = "VariableIdentifier";
  this.name = name;
}

VariableIdentifier.prototype = {
  computeType: function (scope) {
    check (this, scope.get(this.name), "variable " + this.name + " is not defined in scope " + scope);
    return this.type = scope.get(this.name, true);
  },
  generateCode: function (writer, scope) {
    if (scope.get(this.name).type.fields) {
      return "FP + " + scope.get(this.name).offset + " /*" + this.name + "*/";
    }
    return scope.get(this.name).name;
  }
};

function ExpressionStatement (expression) {
  this.tag = "ExpressionStatement";
  this.expression = expression;
}

ExpressionStatement.prototype = {
  computeType: function (scope) {
    return this.expression.computeType(scope);
  },
  generateCode: function (writer, scope) {
    writer.writeLn(this.expression.generateCode(null, scope) + ";");
  }
};

function AssignmentExpression (operator, left, right) {
  this.tag = "AssignmentExpression";
  this.operator = operator;
  this.left = left;
  this.right = right;
}

function generateMemoryCopy(dst, src, size) {
  return "memoryCopy(" + dst + ", " + src + ", " + size + ")";
}

function generateMemoryZero(dst, size) {
  return "memoryZero(" + dst + ", " + size + ")";
}

AssignmentExpression.prototype = {
  computeType: function (scope) {
    var tl = this.leftType = this.left.computeType(scope);
    var tr = this.right.computeType(scope);
    return tl;
  },
  generateCode: function (writer, scope) {
    var l = this.left.generateCode(null, scope);
    var r = this.right.generateCode(null, scope);
    if (this.leftType.fields) {
      return generateMemoryCopy(l, r, this.leftType.getSize());
    }
    return l + " = " + r;
  }
};


function log2(x) {
  return Math.log(x) / Math.LN2;
}

function accessMemory(address, type, offset) {
  if (type === types.int) {
    return "I32[" + address + (offset ? " + " + offset : "") + " >> " + log2(type.getSize()) + "]";
  } else if (type === types.uint || type instanceof PointerType) {
    return "U32[" + address + (offset ? " + " + offset : "") + " >> " + log2(type.getSize()) + "]";
  }
  return notImplemented(type);
};

function PropertyAccess (base, accessor) {
  this.tag = "PropertyAccess";
  this.base = base;
  this.accessor = accessor;
}

PropertyAccess.prototype = {
  computeType: function (scope) {
    var type = this.base.computeType(scope);
    if (this.accessor.tag === "expression") {
      this.accessor.expression.computeType(scope);
      if (type instanceof PointerType) {
        return this.type = type.type;
      }
      assert (false);
    } else if (this.accessor.tag === "arrow") {
      check(this, type instanceof PointerType, "Cannot dereference non pointer type.");
      check(this, type.pointers === 0, "Cannot dereference pointers to pointers type.");
      type = type.base;
    } else {
      check(this, !(type instanceof PointerType), "Cannot use . operator on pointer types.");
    }
    if (type.fields) {
      check(this, type.fields, "Property access on non structs is not possible.");
      var field = type.getField(this.accessor.name);
      check(this, field, "Field \"" + this.accessor.name + "\" does not exist in type " + type + ".");
      this.field = field;
      return this.type = field.type;
    } else {
      return this.type = types.dyn;
    }
  },
  generateCode: function (writer, scope) {
    if (this.accessor.tag === "arrow") {
      return accessMemory(this.base.generateCode(null, scope), this.field.type, this.field.offset);
    } else if (this.accessor.tag === "dot") {
      if (this.base.type === types.dyn) {
        return this.base.generateCode(null, scope) + "." + this.accessor.name;
      } else {
        return accessMemory(this.base.generateCode(null, scope), this.field.type, this.field.offset);
      }
    }
    throw notImplemented();
  }
};

function NewExpression (constructor, arguments) {
  this.tag = "NewExpression";
  this.constructor = constructor;
  this.arguments = arguments;
}

NewExpression.prototype = {
  computeType: function (scope) {
    var ct = getType(this.constructor.name);
    return this.type = new PointerType(ct);
  },
  generateCode: function (writer, scope) {
    assert (!writer);
    return "malloc (" + this.type.type.getSize() + ")";
  }
};

function Block (statements) {
  this.tag = "Block";
  this.statements = statements;
}

Block.prototype = {
  computeType: function (scope) {
    walkComputeTypes(this.statements, scope);
  },
  generateCode: function (writer, scope) {
    walkGenerateCode(this.statements, writer, scope);
  }
};

function WhileStatement (condition, statement, isDoWhile) {
  this.tag = "WhileStatement";
  this.condition = condition;
  this.statement = statement;
  this.isDoWhile = isDoWhile;
}

WhileStatement.prototype = {
  computeType: function (scope) {
    this.condition.computeType(scope);
    this.statement.computeType(scope);
  },
  generateCode: function (writer, scope) {
    if (this.isDoWhile) {
      writer.enter("do {");
    } else {
      writer.enter("while (" + this.condition.generateCode(null, scope) + ") {");
    }
    this.statement.generateCode(writer, scope);
    if (this.isDoWhile) {
      writer.leave("} while (" + this.condition.generateCode(null, scope) + ")");
    } else {
      writer.leave("}");
    }
  }
};

function IfStatement (condition, ifStatement, elseStatement) {
  this.tag = "IfStatement";
  this.condition = condition;
  this.ifStatement = ifStatement;
  this.elseStatement = elseStatement;
}

IfStatement.prototype = {
  computeType: function (scope) {
    this.condition.computeType(scope);
    this.ifStatement.computeType(scope);
    if (this.elseStatement) {
      this.elseStatement.computeType(scope);
    }
  },
  generateCode: function (writer, scope) {
    writer.enter("if (" + this.condition.generateCode(null, scope) + ") {");
    this.ifStatement.generateCode(writer, scope);
    if (this.elseStatement) {
      if (this.elseStatement instanceof Block) {
        writer.leaveAndEnter("} else {");
        this.elseStatement.generateCode(writer, scope);
      } else if (this.elseStatement instanceof IfStatement) {
        writer.leaveAndEnter("} else if (" + this.elseStatement.condition.generateCode(null, scope) + ") {");
        this.elseStatement.ifStatement.generateCode(writer, scope);
      }
    }
    writer.leave("}");
  }
};

function ForStatement (initializer, test, counter, statement) {
  this.tag = "ForStatement";
  this.initializer = initializer;
  this.test = test;
  this.counter = counter;
  this.statement = statement;
}

ForStatement.prototype = {
  computeType: function (scope) {
    if (this.initializer) {
      this.initializer.computeType(scope);
    }
    if (this.test) {
      this.test.computeType(scope);
    }
    if (this.counter) {
      this.counter.computeType(scope);
    }
    this.statement.computeType(scope);
  },
  generateCode: function (writer, scope) {
    scope = new Scope(scope, "For");
    var str = "for (";
    str += (this.initializer ? this.initializer.generateCode(null, scope) : "") + ";";
    str += (this.test ? this.test.generateCode(null, scope) : "") + ";";
    str += (this.counter ? this.counter.generateCode(null, scope) : "");
    str += ") {";
    writer.enter(str);
    this.statement.generateCode(writer, scope);
    writer.leave("}");
  }
};

function compile(source, generateExports) {
  types = {
    int:  new Type("int",  4, 0),
    uint: new Type("uint", 4, 0),

    u8:   new Type("u8",   1, 0),
    i8:   new Type("i8",   1, 0),
    u16:  new Type("u16",  2, 0),
    i16:  new Type("i16",  2, 0),
    u32:  new Type("u32",  4, 0),
    i32:  new Type("i32",  4, 0),

    void: new Type("void", undefined, 0),
    dyn:  new Type("dyn",  undefined, 0),
    null: new Type("null", undefined, 0)
  };

  var program = parser.parse(source);

  print (JSON.stringify(program, null, 2));

  program.computeType();

  print (JSON.stringify(program, null, 2));

  var str = "";
  var writer = new IndentingWriter(false, {writeLn: function (x) {
    str += x + "\n";
  }});

  program.generateCode(writer);

  return str;

}


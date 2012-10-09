if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.TextOperation = (function () {

  // Constructor for new operations.
  function TextOperation () {
    if (this.constructor !== TextOperation) {
      // => function was called without 'new'
      return new TextOperation();
    }

    // When an operation is applied to an input string, you can think of this as
    // if an imaginary cursor runs over the entire string and skips over some
    // parts, deletes some parts and inserts characters at some positions. These
    // actions (skip/delete/insert) are stored as an array in the "ops" property.
    this.ops = [];
    // An operation's baseLength is the length of every string the operation
    // can be applied to.
    this.baseLength = 0;
    // The targetLength is the length of every string that results from applying
    // the operation on a valid input string.
    this.targetLength = 0;
  }

  // After an operation is constructed, the user of the library can specify the
  // actions of an operation (skip/insert/delete) with these three builder
  // methods. They all return the operation for convenient chaining.

  // Skip over a given number of characters.
  TextOperation.prototype.retain = function (n) {
    if (typeof n !== 'number') {
      throw new Error("retain expects an integer");
    }
    if (n === 0) { return this; }
    this.baseLength += n;
    this.targetLength += n;
    var lastOp = this.ops[this.ops.length-1];
    if (lastOp && lastOp.retain) {
      // The last op is a retain op => we can merge them into one op.
      lastOp.retain += n;
    } else {
      // Create a new op.
      this.ops.push({ retain: n });
    }
    return this;
  };

  TextOperation.prototype.equals = function (other) {
    if (this.baseLength !== other.baseLength) { return false; }
    if (this.targetLength !== other.targetLength) { return false; }
    if (this.ops.length !== other.ops.length) { return false; }
    for (var i = 0; i < this.ops.length; i++) {
      var t = this.ops[i], o = other.ops[i];
      if (t.retain && t.retain !== o.retain) { return false; }
      if (t.insert && t.insert !== o.insert) { return false; }
      if (t.delete && t.delete !== o.delete) { return false; }
    }
    return true;
  }

  // Insert a string at the current position.
  TextOperation.prototype.insert = function (str) {
    if (typeof str !== 'string') {
      throw new Error("insert expects a string")
    }
    if (str === '') { return this; }
    this.targetLength += str.length;
    var lastOp = this.ops[this.ops.length-1];
    if (lastOp && lastOp.insert) {
      // Merge insert op.
      lastOp.insert += str;
    } else {
      this.ops.push({ insert: str });
    }
    return this;
  };

  // Delete a string at the current position.
  TextOperation.prototype.delete = function (n) {
    if (typeof n === 'string') { n = n.length; }
    if (typeof n !== 'number') {
      throw new Error("delete expects an integer or a string");
    }
    if (n === 0) { return this; }
    if (n < 0) { n = -n; }
    this.baseLength += n;
    var lastOp = this.ops[this.ops.length-1];
    if (lastOp && lastOp.delete) {
      lastOp.delete += n;
    } else {
      this.ops.push({ delete: n });
    }
    return this;
  };

  // Pretty printing.
  TextOperation.prototype.toString = function () {
    // map: build a new array by applying a function to every element in an old
    // array.
    var map = Array.prototype.map || function (fn) {
      var arr = this;
      var newArr = [];
      for (var i = 0, l = arr.length; i < l; i++) {
        newArr[i] = fn(arr[i]);
      }
      return newArr;
    };
    return map.call(this.ops, function (op) {
      return op.retain
             ? "retain " + op.retain
             : (op.insert
                ? "insert '" + op.insert + "'"
                : "delete " + op.delete);
    }).join(', ');
  };

  // Converts operation into a JSON value.
  TextOperation.prototype.toJSON = function () {
    return this;
  };

  // Converts a plain JS object into an operation and validates it.
  TextOperation.fromJSON = function (obj) {
    var o = new TextOperation();
    var ops = obj.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.retain) {
        o.retain(op.retain);
      } else if (op.insert) {
        o.insert(op.insert);
      } else if (op.delete) {
        o.delete(op.delete);
      } else {
        throw new Error("unknown operation: " + JSON.stringify(op));
      }
    }
    if (o.baseLength !== obj.baseLength) {
      throw new Error("baseLengths don't match");
    }
    if (o.targetLength !== obj.targetLength) {
      throw new Error("targetLengths don't match");
    }
    return o;
  };

  // Apply an operation to a string, returning a new string. Throws an error if
  // there's a mismatch between the input string and the operation.
  TextOperation.prototype.apply = function (str) {
    var operation = this;
    if (str.length !== operation.baseLength) {
      throw new Error("The operation's base length must be equal to the string's length.");
    }
    var newStr = [], j = 0;
    var strIndex = 0;
    var ops = this.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.retain) {
        if (strIndex + op.retain > str.length) {
          throw new Error("Operation can't retain more characters than are left in the string.");
        }
        // Copy skipped part of the old string.
        newStr[j++] = str.slice(strIndex, strIndex + op.retain);
        strIndex += op.retain;
      } else if (op.insert) {
        // Insert string.
        newStr[j++] = op.insert;
      } else { // delete op
        strIndex += op.delete;
      }
    }
    if (strIndex !== str.length) {
      throw new Error("The operation didn't operate on the whole string.");
    }
    return newStr.join('');
  };

  // Computes the inverse of an operation. The inverse of an operation is the
  // operation that reverts the effects of the operation, e.g. when you have an
  // operation 'insert("hello "); skip(6);' then the inverse is 'delete("hello ");
  // skip(6);'. The inverse should be used for implementing undo.
  TextOperation.prototype.invert = function (str) {
    var strIndex = 0;
    var inverse = new TextOperation();
    var ops = this.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.retain) {
        inverse.retain(op.retain);
        strIndex += op.retain;
      } else if (op.insert) {
        inverse.delete(op.insert.length);
      } else { // delete op
        inverse.insert(str.slice(strIndex, strIndex + op.delete));
        strIndex += op.delete;
      }
    }
    return inverse;
  };

  // Compose merges two consecutive operations into one operation, that
  // preserves the changes of both. Or, in other words, for each input string S
  // and a pair of consecutive operations A and B,
  // apply(apply(S, A), B) = apply(S, compose(A, B)) must hold.
  TextOperation.prototype.compose = function (operation2) {
    var operation1 = this;
    if (operation1.targetLength !== operation2.baseLength) {
      throw new Error("The base length of the second operation has to be the target length of the first operation");
    }

    var operation = new TextOperation(); // the combined operation
    var ops1 = operation1.ops, ops2 = operation2.ops; // for fast access
    var i1 = 0, i2 = 0; // current index into ops1 respectively ops2
    var op1 = ops1[i1++], op2 = ops2[i2++]; // current ops
    while (true) {
      // Dispatch on the type of op1 and op2
      if (typeof op1 === 'undefined' && typeof op2 === 'undefined') {
        // end condition: both ops1 and ops2 have been processed
        break;
      }

      if (op1 && op1.delete) {
        operation.delete(op1.delete);
        op1 = ops1[i1++];
        continue;
      }
      if (op2 && op2.insert) {
        operation.insert(op2.insert);
        op2 = ops2[i2++];
        continue;
      }

      if (typeof op1 === 'undefined') {
        throw new Error("Cannot compose operations: first operation is too short.");
      }
      if (typeof op2 === 'undefined') {
        throw new Error("Cannot compose operations: fist operation is too long.");
      }

      // save length of current ops
      var op1l = op1.retain || op1.delete || op1.insert.length;
      var op2l = op2.retain || op2.delete || op2.insert.length;
      var minl = Math.min(op1l, op2l);

      if (op1.retain && op2.retain) {
        operation.retain(minl);
        if (op1l > op2l) {
          op1 = { retain: op1l - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { retain: op2l - op1l };
        }
      } else if (op1.insert && op2.delete) {
        if (op1l > op2l) {
          op1 = { insert: op1.insert.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete - op1l };
        }
      } else if (op1.insert && op2.retain) {
        if (op1l > op2l) {
          operation.insert(op1.insert.slice(0, op2l));
          op1 = { insert: op1.insert.slice(op2l) };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          operation.insert(op1.insert);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.insert(op1.insert);
          op1 = ops1[i1++];
          op2 = { retain: op2l - op1l };
        }
      } else if (op1.retain && op2.delete) {
        if (op1l > op2l) {
          operation.delete(op2.delete);
          op1 = { retain: op1l - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          operation.delete(op2.delete);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.delete(op1l);
          op1 = ops1[i1++];
          op2 = { delete: op2.delete - op1l };
        }
      } else {
        throw new Error(
          "This shouldn't happen: op1: " +
          JSON.stringify(op1) + ", op2: " +
          JSON.stringify(op2)
        );
      }
    }
    return operation;
  };

  // Transform takes two operations A and B that happened concurrently and
  // produces two operations A' and B' (in an arry) such that
  // apply(apply(S, A), B') = apply(apply(S, B), A'). This function is the heart
  // of OT.
  TextOperation.transform = function (operation1, operation2) {
    if (operation1.baseLength !== operation2.baseLength) {
      throw new Error("Both operations have to have the same base length");
    }

    // Use the IDs of the two input operations. This enables clients to
    // recognize their own operations when they receive operations from the
    // server.
    var operation1prime = new TextOperation();
    var operation2prime = new TextOperation();
    var ops1 = operation1.ops, ops2 = operation2.ops;
    var i1 = 0, i2 = 0;
    var op1 = ops1[i1++], op2 = ops2[i2++];
    while (true) {
      if (typeof op1 === 'undefined' && typeof op2 === 'undefined') {
        // end condition: both ops1 and ops2 have been processed
        break;
      }

      // next two cases: one or both ops are insert ops
      // => insert the string in the corresponding prime operation, skip it in
      // the other one. If both op1 and op2 are insert ops, prefer op1.
      if (op1 && op1.insert) {
        operation1prime.insert(op1.insert);
        operation2prime.retain(op1.insert.length);
        op1 = ops1[i1++];
        continue;
      }
      if (op2 && op2.insert) {
        operation1prime.retain(op2.insert.length);
        operation2prime.insert(op2.insert);
        op2 = ops2[i2++];
        continue;
      }

      if (typeof op1 === 'undefined') {
        throw new Error("Cannot compose operations: first operation is too short.");
      }
      if (typeof op2 === 'undefined') {
        throw new Error("Cannot compose operations: fist operation is too long.");
      }

      // At every iteration of the loop, the imaginary cursor that both
      // operation1 and operation2 have that operates on the input string must
      // have the same position in the input string.
      var op1l = op1.retain || op1.delete || op1.insert.length;
      var op2l = op2.retain || op2.delete || op2.insert.length;
      var minl = Math.min(op1l, op2l);

      if (op1.retain && op2.retain) {
        // Simple case: retain/retain
        operation1prime.retain(minl);
        operation2prime.retain(minl);
        if (op1l > op2l) {
          op1 = { retain: op1l - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { retain: op2l - op1l };
        }
      } else if (op1.delete && op2.delete) {
        // Both operations delete the same string at the same position. We don't
        // need to produce any operations, we just skip over the delete ops and
        // handle the case that one operation deletes more than the other.
        if (op1l > op2l) {
          op1 = { delete: op1.delete - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete - op1l };
        }
      // next two cases: delete/retain and retain/delete
      } else if (op1.delete && op2.retain) {
        operation1prime.delete(minl);
        if (op1l > op2l) {
          op1 = { delete: op1.delete - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { retain: op2.retain - op1l };
        }
      } else if (op1.retain && op2.delete) {
        operation2prime.delete(minl);
        if (op1l > op2l) {
          op1 = { retain: op1.retain - op2l };
          op2 = ops2[i2++];
        } else if (op1l === op2l) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op1 = ops1[i1++];
          op2 = { delete: op2.delete - op1l };
        }
      } else {
        throw new Error("The two operations aren't compatible");
      }
    }
    return [operation1prime, operation2prime];
  };

  return TextOperation;

})();

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.TextOperation;
}if (typeof ot === 'undefined') {
  // Export for browsers
  var ot = {};
}

ot.WrappedOperation = (function (global) {

  // A WrappedOperation contains an operation and corresponing metadata.
  function WrappedOperation (operation, meta) {
    this.wrapped = operation;
    this.meta    = meta || {};
  }

  WrappedOperation.prototype.apply = function () {
    return this.wrapped.apply.apply(this.wrapped, arguments);
  };

  WrappedOperation.prototype.invert = function () {
    var inverted = this.wrapped.invert.apply(this.wrapped, arguments);
    return new WrappedOperation(inverted, this.meta);
  };

  // Copy all properties from source to target.
  function copy (source, target) {
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        target[key] = source[key];
      }
    }
  }

  WrappedOperation.prototype.compose = function (other) {
    var meta = {};
    copy(this.meta, meta);
    copy(other.meta, meta);
    return new WrappedOperation(this.wrapped.compose(other.wrapped), meta);
  };

  WrappedOperation.transform = function (a, b) {
    var transform = a.wrapped.constructor.transform;
    var pair = transform(a.wrapped, b.wrapped);
    return [
      new WrappedOperation(pair[0], a.meta),
      new WrappedOperation(pair[1], b.meta)
    ];
  };

  return WrappedOperation;

})(this);

// Export for CommonJS
if (typeof module === 'object') {
  module.exports = ot.WrappedOperation;
}// translation of https://github.com/djspiewak/cccp/blob/master/agent/src/main/scala/com/codecommit/cccp/agent/state.scala

if (typeof ot === 'undefined') {
  var ot = {};
}

ot.Client = (function (global) {

  // Client constructor
  function Client (revision) {
    this.revision = revision; // the next expected revision number
    this.state = synchronized; // start state
  }

  Client.prototype.setState = function (state) {
    this.state = state;
  };

  // Call this method when the user changes the document.
  Client.prototype.applyClient = function (operation) {
    this.setState(this.state.applyClient(this, operation));
  };

  // Call this method with a new operation from the server
  Client.prototype.applyServer = function (operation) {
    this.revision++;
    this.setState(this.state.applyServer(this, operation));
  };

  Client.prototype.serverAck = function () {
    this.revision++;
    this.setState(this.state.serverAck(this));
  };

  // Override this method.
  Client.prototype.sendOperation = function (revision, operation) {
    throw new Error("sendOperation must be defined in child class");
  };

  // Override this method.
  Client.prototype.applyOperation = function (operation) {
    throw new Error("applyOperation must be defined in child class");
  };


  // In the 'Synchronized' state, there is no pending operation that the client
  // has sent to the server.
  function Synchronized () {}
  Client.Synchronized = Synchronized;

  Synchronized.prototype.applyClient = function (client, operation) {
    // When the user makes an edit, send the operation to the server and
    // switch to the 'AwaitingConfirm' state
    client.sendOperation(client.revision, operation);
    return new AwaitingConfirm(operation);
  };

  Synchronized.prototype.applyServer = function (client, operation) {
    // When we receive a new operation from the server, the operation can be
    // simply applied to the current document
    client.applyOperation(operation);
    return this;
  };

  Synchronized.prototype.serverAck = function (client) {
    throw new Error("There is no pending operation.");
  };

  // Singleton
  var synchronized = new Synchronized();


  // In the 'AwaitingConfirm' state, there's one operation the client has sent
  // to the server and is still waiting for an acknowledgement.
  function AwaitingConfirm (outstanding) {
    // Save the pending operation
    this.outstanding = outstanding;
  }
  Client.AwaitingConfirm = AwaitingConfirm;

  AwaitingConfirm.prototype.applyClient = function (client, operation) {
    // When the user makes an edit, don't send the operation immediately,
    // instead switch to 'AwaitingWithBuffer' state
    return new AwaitingWithBuffer(this.outstanding, operation);
  };

  AwaitingConfirm.prototype.applyServer = function (client, operation) {
    // This is another client's operation. Visualization:
    //
    //                   /\
    // this.outstanding /  \ operation
    //                 /    \
    //                 \    /
    //  pair[1]         \  / pair[0] (new outstanding)
    //  (can be applied  \/
    //  to the client's
    //  current document)
    var pair = operation.constructor.transform(this.outstanding, operation);
    client.applyOperation(pair[1]);
    return new AwaitingConfirm(pair[0]);
  };

  AwaitingConfirm.prototype.serverAck = function (client) {
    // The client's operation has been acknowledged
    // => switch to synchronized state
    return synchronized;
  };


  // In the 'AwaitingWithBuffer' state, the client is waiting for an operation
  // to be acknowledged by the server while buffering the edits the user makes
  function AwaitingWithBuffer (outstanding, buffer) {
    // Save the pending operation and the user's edits since then
    this.outstanding = outstanding;
    this.buffer = buffer;
  }
  Client.AwaitingWithBuffer = AwaitingWithBuffer;

  AwaitingWithBuffer.prototype.applyClient = function (client, operation) {
    // Compose the user's changes onto the buffer
    var newBuffer = this.buffer.compose(operation);
    return new AwaitingWithBuffer(this.outstanding, newBuffer);
  };

  AwaitingWithBuffer.prototype.applyServer = function (client, operation) {
    // Operation comes from another client
    //
    //                       /\
    //     this.outstanding /  \ operation
    //                     /    \
    //                    /\    /
    //       this.buffer /  \* / pair1[0] (new outstanding)
    //                  /    \/
    //                  \    /
    //          pair2[1] \  / pair2[0] (new buffer)
    // the transformed    \/
    // operation -- can
    // be applied to the
    // client's current
    // document
    //
    // * pair1[1]
    var transform = operation.constructor.transform;
    var pair1 = transform(this.outstanding, operation);
    var pair2 = transform(this.buffer, pair1[1]);
    client.applyOperation(pair2[1]);
    return new AwaitingWithBuffer(pair1[0], pair2[0]);
  };

  AwaitingWithBuffer.prototype.serverAck = function (client) {
    // The pending operation has been acknowledged
    // => send buffer
    client.sendOperation(client.revision, this.buffer);
    return new AwaitingConfirm(this.buffer);
  };


  return Client;

})(this);

if (typeof module === 'object') {
  module.exports = ot.Client;
}(function () {
  // Monkey patching, yay!

  // The oldValue is needed to find
  ot.TextOperation.fromCodeMirrorChange = function (change, oldValue) {
    var operation = new ot.TextOperation();
    // Holds the current value
    var lines = oldValue.split('\n');

    // Given a { line, ch } object, return the index into the string represented
    // by the current lines object.
    function indexFromPos (pos) {
      var line = pos.line, ch = pos.ch;
      var index = 0;
      for (var i = 0; i < pos.line; i++) {
        index += lines[i].length + 1;
      }
      index += ch;
      return index;
    }

    // The number of characters in the current lines array + number of newlines.
    function getLength () {
      var length = 0;
      for (var i = 0, l = lines.length; i < l; i++) {
        length += lines[i].length;
      }
      return length + lines.length - 1; // include '\n's
    }

    // Returns the substring of the current lines array in the range given by
    // 'from' and 'to' which must be { line, ch } objects
    function getRange (from, to) {
      // Precondition: to ">" from
      if (from.line === to.line) {
        return lines[from.line].slice(from.ch, to.ch);
      }
      var str = lines[from.line].slice(from.ch) + '\n';
      for (var i = from.line + 1; i < to.line; i++) {
        str += lines[i] + '\n';
      }
      str += lines[to.line].slice(0, to.ch);
      return str;
    }

    // Replace the range defined by 'from' and 'to' by 'text' (array of lines).
    // Alters the lines array.
    function replaceRange (text, from, to) {
      // Precondition: to ">" from
      var strLines = text.slice(0); // copy
      var pre = lines[from.line].slice(0, from.ch);
      var post = lines[to.line].slice(to.ch);
      strLines[0] = pre + strLines[0];
      strLines[strLines.length-1] += post;

      strLines.unshift(to.line - from.line + 1); // 2nd positional parameter
      strLines.unshift(from.line); // 1st positional parameter
      lines.splice.apply(lines, strLines);
    }

    // Convert a single CodeMirror change to an operation. Assumes that lines
    // represents the state of the document before the CodeMirror change took
    // place. Alters the lines array so that it represents the document's
    // content after the change.
    function generateOperation (operation, change) {
      var from   = indexFromPos(change.from);
      var to     = indexFromPos(change.to);
      var length = getLength();
      operation.retain(from);
      operation.delete(getRange(change.from, change.to));
      operation.insert(change.text.join('\n'));
      operation.retain(length - to);
      replaceRange(change.text, change.from, change.to);
    }

    // Convert the first element of the linked list of changes to an operation.
    generateOperation(operation, change);
    //oldValue = operation.apply(oldValue);
    //assert(oldValue === lines.join('\n'));

    // handle lists of operations by doing a left-fold over the linked list,
    // convert each change to an operation and composing it.
    while (true) {
      //assert(operation.targetLength === getLength());
      change = change.next;
      if (!change) { break; }
      var nextOperation = new ot.TextOperation(operation.revision + 1);
      generateOperation(nextOperation, change);
      //oldValue = nextOperation.apply(oldValue);
      //assert(oldValue === lines.join('\n'));
      operation = operation.compose(nextOperation);
    }

    return operation;
  };

  // Apply an operation to a CodeMirror instance.
  ot.TextOperation.prototype.applyToCodeMirror = function (cm) {
    var operation = this;
    cm.operation(function () {
      var ops = operation.ops;
      var index = 0; // holds the current index into CodeMirror's content
      for (var i = 0, l = ops.length; i < l; i++) {
        var op = ops[i];
        if (op.retain) {
          index += op.retain;
        } else if (op.insert) {
          cm.replaceRange(op.insert, cm.posFromIndex(index));
          index += op.insert.length;
        } else if (op.delete) {
          var from = cm.posFromIndex(index);
          var to   = cm.posFromIndex(index + op.delete);
          cm.replaceRange('', from, to);
        }
      }
      // Check that the operation spans the whole content
      assert(index === cm.getValue().length);
    });
  };

  // Throws an error if the first argument is falsy. Useful for debugging.
  function assert (b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

})();ot.CodeMirrorClient = (function () {
  var Client = ot.Client;
  var TextOperation = ot.TextOperation;
  var WrappedOperation = ot.WrappedOperation;

  function CodeMirrorClient (socket, cm) {
    this.socket = socket;
    this.cm = cm;
    this.fromServer = false;
    this.unredo = false;
    this.undoStack = [];
    this.redoStack = [];
    this.clients = {};
    this.initializeClientList();

    var self = this;
    socket.on('doc', function (obj) {
      Client.call(self, obj.revision);
      self.initializeCodeMirror(obj.str);
      self.initializeSocket();
      self.initializeClients(obj.clients);
    });
  }

  inherit(CodeMirrorClient, Client);

  CodeMirrorClient.prototype.applyClient = function (operation) {
    operation.meta.cursor = this.cursor;
    operation.meta.selectionEnd = this.selectionEnd;
    clearTimeout(this.sendCursorTimeout);
    Client.prototype.applyClient.call(this, operation);
  };

  CodeMirrorClient.prototype.applyServer = function (operation) {
    Client.prototype.applyServer.call(this, operation);
  };

  CodeMirrorClient.prototype.initializeSocket = function () {
    var self = this;

    this.socket
      .on('client_left', function (obj) {
        self.onClientLeft(obj.clientId);
      })
      .on('set_name', function (obj) {
        var client = self.getClientObject(obj.clientId);
        client.setName(obj.name);
      })
      .on('ack', function () { self.serverAck(); })
      .on('operation', function (obj) {
        var operation = new WrappedOperation(TextOperation.fromJSON(obj.operation), obj.meta);
        console.log("Operation from server by client " + obj.meta.clientId + ":", operation);
        self.applyServer(operation);
      })
      .on('cursor', function (obj) {
        var client = self.getClientObject(obj.clientId);
        client.updateCursor(obj.cursor, obj.selectionEnd);
      });
  };



  function OtherClient (id, listEl, cm, name, cursor, selectionEnd) {
    this.id = id;
    this.listEl = listEl;
    this.cm = cm;
    this.name = name;
    this.selectionClassName = 'client-selection-' + randomInt(1e6);

    this.li = document.createElement('li');
    if (name) {
      this.li.textContent = name;
      this.listEl.appendChild(this.li);
    }

    this.cursorEl = document.createElement('pre');
    this.cursorEl.className = 'other-client';
    this.cursorEl.style.borderLeftWidth = '2px';
    this.cursorEl.style.borderLeftStyle = 'solid';
    this.cursorEl.innerHTML = '&nbsp;';

    if (typeof cursor === 'number' && typeof selectionEnd === 'number') {
      this.updateCursor(cursor, selectionEnd);
    }
    this.setColor(name ? hueFromName(name) : Math.random());
  }

  OtherClient.prototype.setColor = function (hue) {
    this.hue = hue;

    var color = hsl2hex(hue, 0.75, 0.5);
    if (this.li) { this.li.style.color = color; }
    this.cursorEl.style.borderLeftColor = color;

    var lightColor = hsl2hex(hue, 0.5, 0.9);
    var selector = '.' + this.selectionClassName;
    var styles = 'background:' + lightColor + ';';
    var rule = selector + '{' + styles + '}';
    addStyleRule(rule);
  };

  OtherClient.prototype.setName = function (name) {
    this.name = name;

    this.li.textContent = name;
    if (!this.li.parentNode) {
      this.listEl.appendChild(this.li);
    }

    this.setColor(hueFromName(name));
  };

  OtherClient.prototype.updateCursor = function (cursor, selectionEnd) {
    this.cursor = cursor;
    this.selectionEnd = selectionEnd;

    removeElement(this.cursorEl);
    if (this.mark) {
      this.mark.clear();
      delete this.mark;
    }

    var cursorPos = cm.posFromIndex(cursor);
    if (cursor === selectionEnd) {
      // show cursor
      var cursorCoords = cm.cursorCoords(cursorPos);
      this.cursorEl.style.height = (cursorCoords.bottom - cursorCoords.top) * 0.85 + 'px';
      this.cm.addWidget(cursorPos, this.cursorEl, false);
    } else {
      // show selection
      var fromPos, toPos;
      if (selectionEnd > cursor) {
        fromPos = cursorPos;
        toPos = this.cm.posFromIndex(selectionEnd);
      } else {
        fromPos = this.cm.posFromIndex(selectionEnd);
        toPos = cursorPos;
      }
      this.mark = this.cm.markText(fromPos, toPos, this.selectionClassName);
    }
  };

  OtherClient.prototype.remove = function () {
    if (this.li) { removeElement(this.li); }
    if (this.cursorEl) { removeElement(this.cursorEl); }
    if (this.mark) { this.mark.clear(); }
  };



  CodeMirrorClient.prototype.getClientObject = function (clientId) {
    var client = this.clients[clientId];
    if (client) { return client; }
    return this.clients[clientId] = new OtherClient(clientId, this.clientListEl, this.cm);
  };

  CodeMirrorClient.prototype.onClientLeft = function (clientId) {
    console.log("User disconnected: " + clientId);
    var client = this.clients[clientId];
    if (!client) { return; }
    client.remove();
    delete this.clients[clientId];
  };

  CodeMirrorClient.prototype.initializeCodeMirror = function (str) {
    var cm = this.cm;
    var self = this;

    cm.setValue(str);
    this.oldValue = str;

    cm.on('change', function (_, change) {
      self.onCodeMirrorChange(change);
    });

    cm.on('cursorActivity', function (_) {
      self.onCodeMirrorCursorActivity();
    });

    cm.undo = function () { self.undo(); };
    cm.redo = function () { self.redo(); };
  };

  CodeMirrorClient.prototype.initializeClients = function (clients) {
    for (var clientId in clients) {
      if (clients.hasOwnProperty(clientId)) {
        var client = clients[clientId];
        client.clientId = clientId;
        this.clients[clientId] = new OtherClient(
          client.clientId, this.clientListEl, this.cm,
          client.name, client.cursor, client.selectionEnd
        );
      }
    }
  };

  CodeMirrorClient.prototype.initializeClientList = function () {
    this.clientListEl = document.createElement('ul');
  };

  function cleanNoops (stack) {
    function isNoop (operation) {
      var ops = operation.ops;
      return ops.length === 0 || (ops.length === 1 && !!ops[0].retain);
    }

    while (stack.length > 0) {
      var operation = stack[stack.length - 1];
      if (isNoop(operation)) {
        stack.pop();
      } else {
        break;
      }
    }
  }

  var UNDO_DEPTH = 20;

  function cursorIndexAfterOperation (operation) {
    // TODO
    var ops = operation.ops;
    if (ops[0].retain) {
      var index = ops[0].retain;
      if (ops[1].insert) {
        return index + ops[1].insert.length;
      } else {
        return index;
      }
    } else if (ops[0].insert) {
      return ops[0].insert.length;
    } else {
      return 0;
    }
  }

  CodeMirrorClient.prototype.unredoHelper = function (sourceStack, targetStack) {
    cleanNoops(sourceStack);
    if (sourceStack.length === 0) { return; }
    var operation = sourceStack.pop();
    targetStack.push(operation.invert(this.oldValue));
    this.unredo = true;
    operation.applyToCodeMirror(this.cm);
    this.cursor = this.selectionEnd = cursorIndexAfterOperation(operation);
    this.cm.setCursor(this.cm.posFromIndex(this.cursor));
    this.applyClient(new WrappedOperation(operation));
  };

  CodeMirrorClient.prototype.transformUnredoStack = function (stack, operation) {
    cleanNoops(stack);
    for (var i = stack.length - 1; i >= 0; i--) {
      var transformedPair = TextOperation.transform(stack[i], operation);
      stack[i]  = transformedPair[0];
      operation = transformedPair[1];
    }
  };

  CodeMirrorClient.prototype.addOperationToUndo = function (operation) {
    function isSimpleOperation (operation, fn) {
      var ops = operation.ops;
      switch (ops.length) {
        case 0: return true;
        case 1: return !!fn(ops[0]);
        case 2: return !!((ops[0].retain && fn(ops[1])) || (fn(ops[0]) && ops[1].retain));
        case 3: return !!(ops[0].retain && fn(ops[1]) && ops[2].retain);
        default: return false;
      }
    }

    function isSimpleInsert (operation) {
      return isSimpleOperation(operation, function (op) { return op.insert; });
    }

    function isSimpleDelete (operation) {
      return isSimpleOperation(operation, function (op) { return op.delete; });
    }

    function shouldBeComposed (a, b) {
      if (isSimpleInsert(a) && isSimpleInsert(b)) {
        return isSimpleInsert(a.compose(b));
      } else if (isSimpleDelete(a) && isSimpleDelete(b)) {
        var opA = a.ops[0], opsB = b.ops;
        if (!opA.retain) { return false; }
        if (opsB[0].delete) {
          return opA.retain === opsB[0].delete;
        } else {
          return opA.retain === opsB[0].retain + opsB[1].delete;
        }
      }
      return false;
    }

    if (this.undoStack.length === 0) {
      this.undoStack.push(operation);
    } else {
      var lastOperation = this.undoStack[this.undoStack.length - 1];
      if (shouldBeComposed(operation, lastOperation)) {
        var composed = operation.compose(lastOperation);
        this.undoStack[this.undoStack.length - 1] = composed;
      } else {
        this.undoStack.push(operation);
        if (this.undoStack.length > UNDO_DEPTH) {
          this.undoStack.shift();
        }
      }
    }
    if (this.redoStack.length > 0) { this.redoStack = []; }
  };

  CodeMirrorClient.prototype.undo = function () {
    this.unredoHelper(this.undoStack, this.redoStack);
  };

  CodeMirrorClient.prototype.redo = function () {
    this.unredoHelper(this.redoStack, this.undoStack);
  };

  CodeMirrorClient.prototype.onCodeMirrorChange = function (change) {
    var cm = this.cm;
    try {
      if (!this.fromServer && !this.unredo) {
        var operation = TextOperation.fromCodeMirrorChange(change, this.oldValue);
        this.addOperationToUndo(operation.invert(this.oldValue));
        this.applyClient(new WrappedOperation(operation, {}));
      }
    } finally {
      this.fromServer = false;
      this.unredo     = false;
      this.oldValue = cm.getValue();
    }
  };

  CodeMirrorClient.prototype.onCodeMirrorCursorActivity = function () {
    var cm = this.cm;
    function eqPos (a, b) {
      return a.line === b.line && a.ch === b.ch;
    }

    var cursorPos = cm.getCursor();
    var cursor = cm.indexFromPos(cursorPos);
    var selectionEnd;
    if (cm.somethingSelected()) {
      var startPos = cm.getCursor(true);
      var selectionEndPos = eqPos(cursorPos, startPos) ? cm.getCursor(false) : startPos;
      selectionEnd = cm.indexFromPos(selectionEndPos);
    } else {
      selectionEnd = cursor;
    }

    this.cursor = cursor;
    this.selectionEnd = selectionEnd;

    if (this.state === 'awaitingWithBuffer') {
      this.buffer.meta.cursor = cursor;
      this.buffer.meta.selectionEnd = selectionEnd;
    } else {
      var self = this;
      clearTimeout(this.sendCursorTimeout);
      this.sendCursorTimeout = setTimeout(function () {
        self.socket.emit('cursor', {
          cursor: cursor,
          selectionEnd: selectionEnd
        });
      }, 50);
    }
  };

  CodeMirrorClient.prototype.sendOperation = function (revision, operation) {
    this.socket.emit('operation', {
      revision: revision,
      meta: operation.meta,
      operation: operation.wrapped.toJSON()
    });
  };

  CodeMirrorClient.prototype.applyOperation = function (operation) {
    this.fromServer = true;
    operation.wrapped.applyToCodeMirror(this.cm);

    var meta = operation.meta;
    var client = this.getClientObject(meta.clientId);
    client.updateCursor(meta.cursor, meta.selectionEnd);

    this.transformUnredoStack(this.undoStack, operation.wrapped);
    this.transformUnredoStack(this.redoStack, operation.wrapped);
  };

  function randomInt (n) {
    return Math.floor(Math.random() * n);
  }

  function rgb2hex (r, g, b) {
    function digits (n) {
      var m = Math.round(255*n).toString(16);
      return m.length === 1 ? '0'+m : m;
    }
    return '#' + digits(r) + digits(g) + digits(b);
  }

  function hsl2hex (h, s, l) {
    if (s === 0) { return rgb2hex(l, l, l); }
    var var2 = l < 0.5 ? l * (1+s) : (l+s) - (s*l);
    var var1 = 2 * l - var2;
    var hue2rgb = function (hue) {
      if (hue < 0) { hue += 1; }
      if (hue > 1) { hue -= 1; }
      if (6*hue < 1) { return var1 + (var2-var1)*6*hue; }
      if (2*hue < 1) { return var2; }
      if (3*hue < 2) { return var1 + (var2-var1)*6*(2/3 - hue); }
      return var1;
    };
    return rgb2hex(hue2rgb(h+1/3), hue2rgb(h), hue2rgb(h-1/3));
  }

  function hueFromName (name) {
    var a = 1;
    for (var i = 0; i < name.length; i++) {
      a = 17 * (a+name.charCodeAt(i)) % 360;
    }
    return a/360;
  }

  // Set Const.prototype.__proto__ to Super.prototype
  function inherit (Const, Super) {
    function F () {}
    F.prototype = Super.prototype;
    Const.prototype = new F();
    Const.prototype.constructor = Const;
  }

  // Remove an element from the DOM.
  function removeElement (el) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function addStyleRule (css) {
    try {
      var styleSheet = document.styleSheets.item(0),
          insertionPoint = (styleSheet.rules? styleSheet.rules:
              styleSheet.cssRules).length;
      styleSheet.insertRule(css, insertionPoint);
    } catch (exc) {
      console.error("Couldn't add style rule.", exc);
    }
  }

  return CodeMirrorClient;
})();

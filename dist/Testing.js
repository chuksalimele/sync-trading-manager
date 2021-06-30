"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Testing = void 0;
var TestingPeer_1 = require("./TestingPeer");
var Testing = /** @class */ (function (_super) {
    __extends(Testing, _super);
    function Testing() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.b = "this is a string";
        _this.peer = null;
        return _this;
    }
    Testing.prototype.func2 = function () {
    };
    return Testing;
}(TestingPeer_1.TestingPeer));
exports.Testing = Testing;
//# sourceMappingURL=Testing.js.map
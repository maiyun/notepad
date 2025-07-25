"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const clickgo = __importStar(require("clickgo"));
class default_1 extends clickgo.form.AbstractForm {
    constructor() {
        super(...arguments);
        this.title = 'New file - ClickGo Notepad';
        this.nosave = true;
        this.file = '';
        this.text = '';
    }
    onMin() {
        return __awaiter(this, void 0, void 0, function* () {
            yield clickgo.native.min();
        });
    }
    onInput() {
        if (this.nosave) {
            return;
        }
        this.nosave = true;
    }
    toNew() {
        this.nosave = true;
        this.file = '';
        this.text = '';
        this.title = 'New file - ClickGo Notepad';
    }
    open() {
        return __awaiter(this, void 0, void 0, function* () {
            const paths = yield clickgo.native.open({
                'filters': [
                    {
                        'name': 'Text Files',
                        'accept': ['txt']
                    }
                ]
            });
            if (!paths) {
                return;
            }
            const content = yield clickgo.fs.getContent('/storage' + paths[0], {
                'encoding': 'utf8',
            });
            if (!content) {
                return;
            }
            this.nosave = false;
            this.file = paths[0];
            this.text = content;
            this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
        });
    }
    save() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.nosave) {
                return;
            }
            if (!this.file) {
                const path = yield clickgo.native.save({
                    'filters': [
                        {
                            'name': 'Text Files',
                            'accept': ['txt']
                        }
                    ]
                });
                if (!path) {
                    return;
                }
                this.file = path;
                this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
            }
            yield clickgo.fs.putContent('/storage' + this.file, this.text, {
                'encoding': 'utf8',
            });
            this.nosave = false;
        });
    }
    saveAs() {
        return __awaiter(this, void 0, void 0, function* () {
            const path = yield clickgo.native.save({
                'filters': [
                    {
                        'name': 'Text Files',
                        'accept': ['txt']
                    }
                ]
            });
            if (!path) {
                return;
            }
            this.file = path;
            this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
            yield clickgo.fs.putContent('/storage' + this.file, this.text, {
                'encoding': 'utf8',
            });
            this.nosave = false;
        });
    }
    exit() {
        this.close();
    }
    about() {
        return __awaiter(this, void 0, void 0, function* () {
            yield clickgo.form.dialog('ClickGo Notepad 0.0.2');
        });
    }
}
exports.default = default_1;

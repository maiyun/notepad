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
const box = document.getElementById('box');
box.addEventListener('mouseenter', function () {
    if (!navigator.userAgent.includes('immersion/1')) {
        return;
    }
    clickgo.native.invoke('cg-mouse-ignore', clickgo.native.getToken(), false);
});
box.addEventListener('mouseleave', function () {
    if (!navigator.userAgent.includes('immersion/1')) {
        return;
    }
    clickgo.native.invoke('cg-mouse-ignore', clickgo.native.getToken(), true);
});
class Boot extends clickgo.AbstractBoot {
    main() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const block = document.getElementById('block');
            let first = true;
            const taskId = yield clickgo.task.run('app/', {
                'notify': false,
                'progress': (loaded, total) => {
                    if (first) {
                        first = false;
                        block.style.transitionDuration = '.5s';
                    }
                    block.style.width = ((loaded + 1) / (total + 1) * 100).toString() + '%';
                },
                'permissions': ['root'],
            });
            console.log('taskId', taskId);
            (_a = document.getElementById('main')) === null || _a === void 0 ? void 0 : _a.remove();
        });
    }
    onError(taskId, formId, error, info) {
        console.log(taskId, formId, error, info);
    }
}
clickgo.launcher(new Boot());

import { createFromRoot } from "codama";
import { rootNodeFromAnchor, type IdlV01 } from "@codama/nodes-from-anchor";
import anchorIdl from "./idl/launchpad.json";
import { renderJavaScriptVisitor } from "@codama/renderers";

import path from "path";

const codama = createFromRoot(rootNodeFromAnchor(anchorIdl as IdlV01));

// Render JavaScript.
const generatedPath = path.join("idl", "launchpad");
codama.accept(renderJavaScriptVisitor(generatedPath));

<template>
  <div v-if="graph && graph.nodes && graph.nodes.length" class="agent-graph">
    <div class="graph-card">
      <div class="canvas" ref="canvasEl" :style="{ height: `${height}px` }">
        <!-- Connection lines -->
        <svg class="edges" :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="none">
          <g v-for="(edge, idx) in laidOutEdges" :key="idx">
            <path :d="edge.path" class="edge" :class="{ highlight: edge.highlight, dependency: edge.dependency }" />
          </g>
        </svg>

        <div v-for="n in laidOutNodes" :key="n.id" class="node" :class="n.className" :style="{ left: `${n.x}px`, top: `${n.y}px` }">
          <div class="node-inner">
            <div class="halo" />
            <div class="icon" :class="n.status"></div>
            <div class="label">{{ n.label }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';

interface GraphNode { id: string; type: string; label: string; status?: 'idle' | 'running' | 'success' | 'error'; badge?: string }
interface GraphEdge { from: string; to: string; label?: string; highlight?: boolean; dependency?: boolean }

const props = defineProps<{ graph: { nodes: GraphNode[]; edges: GraphEdge[]; note?: string } }>();

const canvasEl = ref<HTMLElement | null>(null);
const widthRef = ref(800);
const width = computed(() => widthRef.value);
const nodesCount = computed(() => (props.graph?.nodes?.length || 0));
const gapY = computed(() => 90);
const baseHeight = computed(() => Math.max(200, 40 + Math.max(0, nodesCount.value - 1) * gapY.value + 80));
const height = computed(() => baseHeight.value);

const order = ['orchestrator', 'analyzer', 'planner', 'executor', 'validator'];

const laidOutNodes = computed(() => {
  const nodes = (props.graph?.nodes || []).slice();
  // Sort nodes into a consistent order across the row
  nodes.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const cx = Math.max(100, Math.floor(width.value / 2));
  const gy = gapY.value;
  return nodes.map((n, i) => ({
    ...n,
    x: cx,
    y: 40 + i * gy,
    className: `type-${n.type} status-${n.status || 'idle'}`
  }));
});

const laidOutEdges = computed(() => {
  const nodesById = new Map(laidOutNodes.value.map(n => [n.id, n] as const));
  const raw = (props.graph?.edges || []).map((e, idx) => {
    const from = nodesById.get(e.from);
    const to = nodesById.get(e.to);
    if (!from || !to) return null as any;
    return {
      key: `${e.from}->${e.to}`,
      fromId: e.from,
      toId: e.to,
      x1: from.x + 20,
      y1: from.y + 20,
      x2: to.x + 20,
      y2: to.y + 20,
      highlight: !!(e as any).highlight,
      dependency: !!(e as any).dependency,
      idx
    };
  }).filter(Boolean) as Array<{ key: string; fromId: string; toId: string; x1: number; y1: number; x2: number; y2: number; highlight: boolean; dependency: boolean; idx: number }>;

  // Group edges by pair to spread them horizontally and reduce overlap
  const groups = new Map<string, number[]>();
  raw.forEach((r, i) => {
    if (!groups.has(r.key)) groups.set(r.key, []);
    groups.get(r.key)!.push(i);
  });

  const SPACING = 22; // horizontal offset between parallel edges
  const edges = raw.map((r, i) => {
    const g = groups.get(r.key)!;
    const pos = g.indexOf(i);
    const mid = (g.length - 1) / 2;
    const dx = (pos - mid) * SPACING;
    const cx1 = r.x1 + dx;
    const cx2 = r.x2 + dx;
    const path = `M ${r.x1} ${r.y1} C ${cx1} ${r.y1}, ${cx2} ${r.y2}, ${r.x2} ${r.y2}`;
    return { from: r.fromId, to: r.toId, path, highlight: r.highlight, dependency: r.dependency };
  });

  return edges;
});

function onResize() {
  const el = canvasEl.value as HTMLElement | null;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  widthRef.value = Math.max(320, Math.floor(rect.width));
  // height auto-computed from nodes
}

let ro: ResizeObserver | null = null;
onMounted(() => {
  onResize();
  ro = new ResizeObserver(() => onResize());
  if (canvasEl.value) ro.observe(canvasEl.value);
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  if (ro && canvasEl.value) ro.unobserve(canvasEl.value);
  window.removeEventListener('resize', onResize);
});
</script>

<style scoped>
.agent-graph { padding: 10px 16px 0; }
.graph-card {
  background: linear-gradient(180deg, rgba(40,44,52,0.9), rgba(40,44,52,0.7));
  border: 1px solid rgba(97,175,239,0.15);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  overflow: hidden;
}
.canvas { position: relative; }
.edges { position: absolute; inset: 0; width: 100%; height: 100%; color: #3a99d8; }
.edge { stroke: currentColor; stroke-width: 2; fill: none; opacity: 0.45; transition: opacity .2s ease, stroke-width .2s ease; }
.edge.highlight { opacity: 0.9; stroke-width: 3; filter: drop-shadow(0 0 6px rgba(97,175,239,0.6)); }
.edge.dependency { stroke-dasharray: 4 4; opacity: 0.35; color: #6aa9dd; }

.node { position: absolute; width: 120px; height: 56px; transform: translate(-50%, -50%); }
.node-inner {
  position: relative; width: 120px; height: 56px; border-radius: 12px; 
  background: rgba(52, 58, 70, 0.85); border: 1px solid rgba(171,178,191,0.2);
  backdrop-filter: blur(6px);
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}
.node:hover .node-inner { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(0,0,0,0.25); border-color: rgba(97,175,239,0.35); }
.node .halo { position: absolute; inset: -6px; border-radius: 14px; background: radial-gradient(ellipse at center, rgba(97,175,239,0.35), transparent 60%); filter: blur(6px); opacity: 0; transition: opacity 240ms ease; }
.node.status-running .halo { opacity: 1; }
.icon { position: absolute; left: 10px; top: 10px; width: 12px; height: 12px; border-radius: 50%; background: #5c6370; box-shadow: 0 0 0 0 rgba(97,175,239,0.6); animation: pulse 2s infinite; }
.icon.running { background: #61afef; }
.node.status-success .icon { background: #98c379; }
.node.status-error .icon { background: #e06c75; animation: none; }
.label { position: absolute; left: 30px; top: 8px; right: 8px; color: #cdd3df; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }


/* Type coloring ring */
.type-orchestrator .node-inner { border-color: rgba(97,175,239,0.5); }
.type-analyzer .node-inner { border-color: rgba(209,154,102,0.5); }
.type-planner .node-inner { border-color: rgba(152,195,121,0.5); }
.type-executor .node-inner { border-color: rgba(97,175,239,0.5); }
.type-validator .node-inner { border-color: rgba(224,108,117,0.5); }

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(97,175,239,0.6); }
  70% { box-shadow: 0 0 0 12px rgba(97,175,239,0); }
  100% { box-shadow: 0 0 0 0 rgba(97,175,239,0); }
}
</style>

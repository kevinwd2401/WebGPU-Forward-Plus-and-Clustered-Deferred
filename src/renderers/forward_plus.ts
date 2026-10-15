import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneBindGroupLayout: GPUBindGroupLayout;
    sceneBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    zPrepassPipeline: GPURenderPipeline;
    forwardPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here

        this.sceneBindGroupLayout =
        renderer.device.createBindGroupLayout({
            label: "forward+ scene layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: "uniform" }
            }]
        });

        this.sceneBindGroup = renderer.device.createBindGroup({
            label: "forward+ scene bind group",
            layout: this.sceneBindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this.camera.uniformsBuffer }
            }]
        });

        this.depthTexture = renderer.device.createTexture({
            label: "forward+ depth texture",
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage:
                GPUTextureUsage.RENDER_ATTACHMENT |
                GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        const pipelineLayout = renderer.device.createPipelineLayout({
        label: "forward+ pipeline layout",
        bindGroupLayouts: [
            this.sceneBindGroupLayout,
            renderer.modelBindGroupLayout,
            renderer.materialBindGroupLayout
        ]
        });

        this.zPrepassPipeline = renderer.device.createRenderPipeline({
            label: "forward+ z prepass pipeline",
            layout: pipelineLayout,

            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },

            vertex: {
                module: renderer.device.createShaderModule({
                    code: shaders.naiveVertSrc
                }),
                buffers: [renderer.vertexBufferLayout]
            },

            fragment: {
                module: renderer.device.createShaderModule({
                    code: shaders.zPrepassFragSrc
                }),
                targets: []
            }
        });

        this.forwardPipeline = renderer.device.createRenderPipeline({
            label: "forward+ color line",
            layout: pipelineLayout,

            depthStencil: {
                depthWriteEnabled: false,
                depthCompare: "equal",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "naive vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "naive frag shader",
                    code: shaders.forwardPlusFragSrc
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });
    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting

        const encoder = renderer.device.createCommandEncoder();

        const zPass = encoder.beginRenderPass({
            label: "naive render pass",
            colorAttachments: [],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        zPass.setPipeline(this.zPrepassPipeline);
        this.drawScene(zPass);
        zPass.end();

        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const colorPass = encoder.beginRenderPass({
            label: "naive render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "load",
                depthStoreOp: "store"
            }
        });

        colorPass.setPipeline(this.forwardPipeline);
        this.drawScene(colorPass);
        colorPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }

    private drawScene(pass: GPURenderPassEncoder) {
        pass.setBindGroup(shaders.constants.bindGroup_scene,this.sceneBindGroup);

        this.scene.iterate(node => {
            pass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            pass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            pass.setVertexBuffer(0, primitive.vertexBuffer);
            pass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            pass.drawIndexed(primitive.numIndices);
        });
    }
}

import { Serie, IArray, DataFrame } from "@youwol/dataframe"
import { Context } from "@youwol/flux-core"
import { createFluxThreeObject3D, defaultMaterial } from "@youwol/flux-three"
import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, MathUtils, Points, PointsMaterial } from "three"
import { KeplerMesh, KeplerPoints } from "./models"



export function createBufferGeometry(
    {   positions, 
        indices 
    }: {
            positions: any, 
            indices?: any 
        }
): BufferGeometry
{
    const geom = new BufferGeometry()

    geom.setAttribute('position', new BufferAttribute(positions, 3) )
    if(indices){
        geom.setIndex(Array.from(indices))
        geom.computeVertexNormals() 
    }
    geom.computeBoundingBox()
    geom.computeBoundingSphere()
    return geom
}


export function createKeplerMesh(df: DataFrame, context: Context): KeplerMesh{

    let geometry =  createBufferGeometry({
        positions: df.series.positions.array as any,
        indices  : df.series.indices.array as any
    })
    context && context.info("Geometry created", geometry)  
    return new KeplerMesh( geometry, defaultMaterial(), df)
}

export function createKeplerPoints(df: DataFrame, context: Context): Points{

    let geometry =  createBufferGeometry({
        positions: df.series.positions.array as any
    })
    context && context.info("Geometry created", geometry)  

    geometry.computeBoundingSphere();
    const material = new PointsMaterial( { size: 5,  color: defaultMaterial().color, sizeAttenuation:false } );

	return new KeplerPoints( geometry, material, df );
}
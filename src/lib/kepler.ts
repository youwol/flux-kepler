import { Serie, IArray } from "@youwol/dataframe"
import { BufferAttribute, BufferGeometry } from "three"



export function createBufferGeometry(
    {   positions, 
        indices 
    }: {
            positions: any, 
            indices: any 
        }
): BufferGeometry
{
    const geom = new BufferGeometry()

    geom.setAttribute('position', new BufferAttribute(positions, 3) )
    geom.setIndex(Array.from(indices))

    geom.computeVertexNormals()
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

